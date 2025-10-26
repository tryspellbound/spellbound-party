import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";
import { getGame, appendTurnToGame } from "@/lib/gameStore";
import { buildGameLoopSystemPrompt } from "@/lib/promptRenderer";
import { streamTurnText } from "@/services/textGeneration";
import { streamTurnImage } from "@/services/imageGeneration";
import { streamTurnAudio } from "@/services/audioGeneration";
import { uploadTurnImage } from "@/lib/imagekit";
import {
  createRequestKeys,
  waitForAllRequestResponses,
  cleanupRequestKeys,
} from "@/lib/requestStore";
import type { Request, MultipleChoiceRequest, FreeTextRequest, YesNoRequest, Player, RequestResponse } from "@/types/game";

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

/**
 * Map player reference (e.g., "player1", "player2") to actual player ID
 * Returns undefined if reference is out of bounds
 */
const mapPlayerReference = (reference: string, players: Player[]): string | undefined => {
  const match = reference.match(/^player(\d+)$/i);
  if (!match) return undefined;

  const index = parseInt(match[1], 10) - 1; // player1 = index 0
  if (index < 0 || index >= players.length) return undefined;

  return players[index].id;
};

/**
 * Parse requests from the XML response
 */
const parseRequests = (raw: string, players: Player[]): Request[] => {
  const requestsMatch = raw.match(/<requests[\s\S]*?>([\s\S]*?)<\/requests>/i);
  if (!requestsMatch) return [];

  const requestsContent = requestsMatch[1];
  const requestMatches = requestsContent.matchAll(/<request\s+([^>]*)>([\s\S]*?)<\/request>/gi);

  const requests: Request[] = [];

  for (const requestMatch of requestMatches) {
    const attributes = requestMatch[1];
    const content = requestMatch[2];

    // Parse attributes
    const typeMatch = attributes.match(/type=["']([^"']+)["']/i);
    const targetPlayerMatch = attributes.match(/target_player=["']([^"']+)["']/i);

    if (!typeMatch) continue;

    const type = typeMatch[1].toLowerCase();
    const targetPlayerRef = targetPlayerMatch?.[1];

    // Parse question
    const questionMatch = content.match(/<question>([\s\S]*?)<\/question>/i);
    if (!questionMatch) continue;

    const question = stripCdata(questionMatch[1]).trim();

    const requestId = randomUUID();

    if (type === "multiple_choice") {
      // Parse choices
      const choiceMatches = content.matchAll(/<choice>([\s\S]*?)<\/choice>/gi);
      const choices: string[] = [];

      for (const choiceMatch of choiceMatches) {
        const choice = stripCdata(choiceMatch[1]).trim();
        if (choice) choices.push(choice);
      }

      if (choices.length > 0) {
        const request: MultipleChoiceRequest = {
          id: requestId,
          type: "multiple_choice",
          question,
          choices,
        };
        requests.push(request);
      }
    } else if (type === "free_text") {
      // Map target player
      if (!targetPlayerRef) continue;
      const playerId = mapPlayerReference(targetPlayerRef, players);
      if (!playerId) continue; // Skip if player reference is invalid

      const request: FreeTextRequest = {
        id: requestId,
        type: "free_text",
        question,
        targetPlayers: [playerId],
      };
      requests.push(request);
    } else if (type === "yes_no") {
      // Map target player
      if (!targetPlayerRef) continue;
      const playerId = mapPlayerReference(targetPlayerRef, players);
      if (!playerId) continue; // Skip if player reference is invalid

      const request: YesNoRequest = {
        id: requestId,
        type: "yes_no",
        question,
        targetPlayers: [playerId],
      };
      requests.push(request);
    }
  }

  return requests;
};

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
        // No longer streaming continuation chunks - will send complete continuation at the end
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
      onChunk: (audioBase64, alignment, normalizedAlignment) => {
        audioChunks.push(audioBase64);
        // Send audio chunk as base64 for streaming playback with alignment data
        sendEvent("audio_chunk", {
          chunk: audioBase64,
          index: audioChunks.length - 1,
          alignment: alignment || undefined,
          normalizedAlignment: normalizedAlignment || undefined,
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

    // Upload final image to ImageKit instead of storing base64
    let imageUrl: string | undefined;
    if (finalImage) {
      console.log(`[STREAM ${requestId}] Uploading image to ImageKit`);
      try {
        // Extract base64 data from data URL
        const base64Data = finalImage.replace(/^data:image\/\w+;base64,/, '');
        const turnId = randomUUID();
        imageUrl = await uploadTurnImage(game.id, turnId, base64Data);
        console.log(`[STREAM ${requestId}] Image uploaded to ImageKit: ${imageUrl}`);
      } catch (error) {
        console.error(`[STREAM ${requestId}] Failed to upload image to ImageKit:`, error);
        // Continue without image if upload fails
        imageUrl = undefined;
      }
    }

    // Parse and handle requests
    const requests = parseRequests(rawBuffer, game.players);
    let responses: Record<string, RequestResponse[]> | undefined;

    if (requests.length > 0) {
      console.log(`[STREAM ${requestId}] Found ${requests.length} request(s)`);
      const turnNumber = game.turns.length; // Current turn index

      // Send requests immediately - TV will wait for audio, phones show immediately
      console.log(`[STREAM ${requestId}] Sending requests to players`);
      sendEvent("requests_received", { requests, turnNumber });

      try {
        // Create Redis keys for request response collection
        await createRequestKeys(game.id, turnNumber, requests);

        // Wait for all responses with callbacks for progress
        responses = await waitForAllRequestResponses(
          game.id,
          turnNumber,
          requests,
          game.players.map((p) => p.id),
          (requestId, response) => {
            console.log(`[STREAM ${requestId}] Received response for request ${requestId} from player ${response.playerId}`);
            sendEvent("request_response", {
              requestId,
              playerId: response.playerId,
              response: response.response,
            });
          }
        );

        console.log(`[STREAM ${requestId}] All requests completed`);
        sendEvent("requests_complete", { responses });

        // Clean up Redis keys
        await cleanupRequestKeys(game.id, turnNumber);
      } catch (error) {
        console.error(`[STREAM ${requestId}] Error handling requests:`, error);
        sendEvent("request_error", {
          message: error instanceof Error ? error.message : "Failed to process requests",
        });
      }
    }

    console.log(`[STREAM ${requestId}] Saving turn to game state`);
    const turn = await appendTurnToGame(game.id, {
      continuation: parsedTurn.continuation,
      imagePrompt: parsedTurn.imagePrompt,
      image: imageUrl,
      requests: requests.length > 0 ? requests : undefined,
      responses,
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
