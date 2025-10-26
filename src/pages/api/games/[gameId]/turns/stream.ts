import type { NextApiRequest, NextApiResponse } from "next";
import { getGame, appendTurnToGame } from "@/lib/gameStore";
import { buildGameLoopSystemPrompt } from "@/lib/promptRenderer";
import { streamTurnText } from "@/services/textGeneration";
import { streamTurnImage } from "@/services/imageGeneration";
import { streamTurnAudio } from "@/services/audioGeneration";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

type TurnPayload = {
  continuation: string;
  imagePrompt?: string;
};

const parseTag = (source: string, tag: string) => {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = source.match(regex);
  if (!match) {
    return undefined;
  }
  return match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim();
};

const getTagSegment = (source: string, tag: string) => {
  const lower = source.toLowerCase();
  const open = lower.indexOf(`<${tag.toLowerCase()}`);
  if (open === -1) {
    return null;
  }
  const openEnd = source.indexOf(">", open);
  if (openEnd === -1) {
    return null;
  }
  const close = lower.indexOf(`</${tag.toLowerCase()}>`, openEnd + 1);
  if (close === -1) {
    return {
      content: source.slice(openEnd + 1),
      closed: false,
    };
  }
  return {
    content: source.slice(openEnd + 1, close),
    closed: true,
  };
};

const stripCdata = (value: string) => value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");

const parseTurnPayload = (raw: string): TurnPayload => {
  const turnMatch = raw.match(/<turn[\s\S]*?>[\s\S]*?<\/turn>/i);
  if (!turnMatch) {
    throw new Error("Model response did not include a <turn> block");
  }

  const continuation = parseTag(turnMatch[0], "continuation");
  if (!continuation) {
    throw new Error("Missing <continuation> content");
  }

  const imagePrompt = parseTag(turnMatch[0], "image_prompt");

  return {
    continuation: continuation.trim(),
    imagePrompt: imagePrompt?.trim() || undefined,
  };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const startTime = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

  console.log(`[STREAM ${requestId}] Handler started`);

  if (req.method !== "GET") {
    console.log(`[STREAM ${requestId}] Method not allowed: ${req.method}`);
    res.setHeader("Allow", "GET");
    res.status(405).end("Method Not Allowed");
    return;
  }

  const { gameId } = req.query;
  if (typeof gameId !== "string") {
    console.log(`[STREAM ${requestId}] Invalid gameId`);
    res.status(400).json({ error: "gameId is required" });
    return;
  }

  console.log(`[STREAM ${requestId}] Processing game: ${gameId}`);

  const game = await getGame(gameId);
  if (!game) {
    console.log(`[STREAM ${requestId}] Game not found: ${gameId}`);
    res.status(404).json({ error: "Game not found" });
    return;
  }

  console.log(`[STREAM ${requestId}] Game loaded, ${game.turns?.length ?? 0} existing turns`);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.status(200);
  res.flushHeaders?.();

  console.log(`[STREAM ${requestId}] SSE connection established`);

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    // Flush immediately to ensure client receives the event
    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
    }
  };

  const keepAlive = setInterval(() => {
    res.write(": keep-alive\n\n");
    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
    }
  }, 15000);

  // Reduced ping frequency - was 50ms (20/sec), now 5000ms (every 5 seconds)
  const ping = setInterval(() => {
    sendEvent("ping", { timestamp: Date.now() });
  }, 5000);

  const abortController = new AbortController();
  let clientDisconnected = false;

  req.on("close", () => {
    clientDisconnected = true;
    console.log(`[STREAM ${requestId}] Client disconnected (duration: ${Date.now() - startTime}ms)`);
    abortController.abort();
  });

  try {
    console.log(`[STREAM ${requestId}] Starting turn generation`);
    sendEvent("turn_status", { status: "preparing" });

    const systemPrompt = await buildGameLoopSystemPrompt(game);
    const userPrompt =
      "Generate the very next turn for Spellbound Party. Respond only with the XML schema described in the system prompt. Aim for about 4 paragraphs of content.";

    console.log(`[STREAM ${requestId}] Starting narration stream`);
    sendEvent("turn_status", { status: "narration" });
    let rawBuffer = "";
    let streamingContinuation = "";
    let imagePrompt: string | undefined;
    let imageTask: Promise<string> | null = null;
    let finalImage: string | undefined;

    const startImageGeneration = (prompt: string) => {
      if (imageTask) {
        console.log(`[STREAM ${requestId}] Image generation already started, skipping`);
        return;
      }
      console.log(`[STREAM ${requestId}] Starting image generation with prompt: ${prompt.substring(0, 100)}...`);
      sendEvent("image_prompt", { prompt });
      sendEvent("turn_status", { status: "image" });
      imageTask = streamTurnImage({
        prompt,
        signal: abortController.signal,
        onEvent: (event) => {
          if (event.type === "image_generation.partial_image") {
            console.log(`[STREAM ${requestId}] Image partial received (index: ${event.partial_image_index})`);
            sendEvent("image_partial", {
              image: `data:image/png;base64,${event.b64_json}`,
              index: event.partial_image_index,
            });
          }
          if (event.type === "image_generation.completed") {
            console.log(`[STREAM ${requestId}] Image generation completed`);
            finalImage = `data:image/png;base64,${event.b64_json}`;
            sendEvent("image_complete", { image: finalImage, usage: event.usage });
          }
        },
      }).catch((err) => {
        console.error(`[STREAM ${requestId}] Image generation error:`, err);
        sendEvent("turn_error", { message: err instanceof Error ? err.message : "Image generation failed" });
        throw err;
      });
    };

    const textStreamStart = Date.now();
    let chunkCount = 0;

    await streamTurnText({
      systemPrompt,
      userPrompt,
      signal: abortController.signal,
      onChunk: (chunk) => {
        chunkCount++;
        rawBuffer += chunk;
        if (!imagePrompt) {
          const promptSegment = getTagSegment(rawBuffer, "image_prompt");
          if (promptSegment?.closed) {
            imagePrompt = stripCdata(promptSegment.content).trim();
            if (imagePrompt) {
              console.log(`[STREAM ${requestId}] Image prompt detected after ${chunkCount} chunks, ${Date.now() - textStreamStart}ms`);
              startImageGeneration(imagePrompt);
            }
          }
        }
        const continuationSegment = getTagSegment(rawBuffer, "continuation");
        if (continuationSegment) {
          const cleanText = stripCdata(continuationSegment.content);
          if (cleanText !== streamingContinuation) {
            streamingContinuation = cleanText;
            sendEvent("continuation_chunk", { text: streamingContinuation });
          }
        }
      },
    });

    console.log(`[STREAM ${requestId}] Text stream completed (${chunkCount} chunks, ${Date.now() - textStreamStart}ms)`);
    console.log(`[STREAM ${requestId}] Raw buffer length: ${rawBuffer.length} chars`);

    const parsedTurn = parseTurnPayload(rawBuffer);
    console.log(`[STREAM ${requestId}] Turn parsed - continuation: ${parsedTurn.continuation.length} chars, imagePrompt: ${parsedTurn.imagePrompt ? 'present' : 'missing'}`);
    sendEvent("continuation_complete", { text: parsedTurn.continuation });

    // Start audio generation immediately after text is complete
    console.log(`[STREAM ${requestId}] Starting audio generation`);
    sendEvent("turn_status", { status: "audio" });
    const audioChunks: string[] = [];
    const audioStreamStart = Date.now();
    let lastChunkLog = Date.now();
    const audioGenerationPromise = streamTurnAudio({
      text: parsedTurn.continuation,
      signal: abortController.signal,
      onChunk: (audioBase64, characterIndex) => {
        audioChunks.push(audioBase64);
        // Send audio chunk as base64 for streaming playback
        sendEvent("audio_chunk", {
          chunk: audioBase64,
          index: audioChunks.length - 1,
          characterIndex,
        });

        // Log every 50 chunks to avoid spam
        if (audioChunks.length % 50 === 0 || Date.now() - lastChunkLog > 5000) {
          console.log(`[STREAM ${requestId}] Sent ${audioChunks.length} audio chunks so far...`);
          lastChunkLog = Date.now();
        }
      },
    })
      .then(() => {
        console.log(`[STREAM ${requestId}] Audio generation completed (${audioChunks.length} chunks, ${Date.now() - audioStreamStart}ms)`);
        // All chunks have been sent via the callback
        sendEvent("audio_complete", { totalChunks: audioChunks.length });
      })
      .catch((err) => {
        console.error(`[STREAM ${requestId}] Audio generation error:`, err);
        sendEvent("audio_error", {
          message: err instanceof Error ? err.message : "Audio generation failed",
        });
      });

    if (parsedTurn.imagePrompt && !imagePrompt) {
      console.log(`[STREAM ${requestId}] Image prompt found in parsed turn, starting late generation`);
      imagePrompt = parsedTurn.imagePrompt;
      startImageGeneration(parsedTurn.imagePrompt);
    }

    // Wait for both image and audio to complete
    console.log(`[STREAM ${requestId}] Waiting for image and audio to complete...`);
    const parallelStart = Date.now();
    await Promise.all([
      imageTask,
      audioGenerationPromise,
    ]);
    console.log(`[STREAM ${requestId}] Parallel tasks completed (${Date.now() - parallelStart}ms)`);

    if (imageTask) {
      const resolved = await imageTask;
      if (!finalImage && resolved) {
        finalImage = `data:image/png;base64,${resolved}`;
      }
    }

    console.log(`[STREAM ${requestId}] Saving turn to game state`);
    const turn = await appendTurnToGame(game.id, {
      continuation: parsedTurn.continuation,
      imagePrompt: parsedTurn.imagePrompt,
      image: finalImage,
    });

    console.log(`[STREAM ${requestId}] Turn saved with ID: ${turn.id}`);
    sendEvent("turn_complete", { turn });
    sendEvent("done", { status: "complete" });
    console.log(`[STREAM ${requestId}] Stream completed successfully (total: ${Date.now() - startTime}ms)`);

    // Wait a moment to ensure all buffered events are flushed to the client
    // This is especially important for audio chunks which may be buffered
    console.log(`[STREAM ${requestId}] Waiting 500ms to ensure all events are flushed...`);
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(`[STREAM ${requestId}] Flush delay complete`);
  } catch (error) {
    console.error(`[STREAM ${requestId}] ERROR:`, error);
    console.error(`[STREAM ${requestId}] Error stack:`, error instanceof Error ? error.stack : 'N/A');
    sendEvent("turn_error", {
      message: error instanceof Error ? error.message : "Unable to resolve turn",
    });
    // Also wait a bit before closing on error to ensure error event is received
    await new Promise(resolve => setTimeout(resolve, 100));
  } finally {
    console.log(`[STREAM ${requestId}] Cleaning up (clientDisconnected: ${clientDisconnected})`);
    clearInterval(keepAlive);
    clearInterval(ping);
    res.end();
  }
}
