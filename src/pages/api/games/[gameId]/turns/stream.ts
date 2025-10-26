import type { NextApiRequest, NextApiResponse } from "next";
import { getGame, appendTurnToGame } from "@/lib/gameStore";
import { buildGameLoopSystemPrompt } from "@/lib/promptRenderer";
import { streamTurnText } from "@/services/textGeneration";
import { streamTurnImage } from "@/services/imageGeneration";

export const config = {
  api: {
    bodyParser: false,
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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end("Method Not Allowed");
    return;
  }

  const { gameId } = req.query;
  if (typeof gameId !== "string") {
    res.status(400).json({ error: "gameId is required" });
    return;
  }

  const game = await getGame(gameId);
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.status(200);
  res.flushHeaders?.();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const keepAlive = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 15000);

  const abortController = new AbortController();
  req.on("close", () => {
    abortController.abort();
  });

  try {
    sendEvent("turn_status", { status: "preparing" });

    const systemPrompt = await buildGameLoopSystemPrompt(game);
    const userPrompt =
      "Generate the very next turn for Spellbound Party. Respond only with the XML schema described in the system prompt.";

    sendEvent("turn_status", { status: "narration" });
    let latestText = "";
    const rawTurn = await streamTurnText({
      systemPrompt,
      userPrompt,
      signal: abortController.signal,
      onChunk: (_chunk, aggregated) => {
        latestText = aggregated;
        sendEvent("continuation_chunk", { text: aggregated });
      },
    });

    const parsedTurn = parseTurnPayload(rawTurn || latestText);
    sendEvent("continuation_complete", { text: parsedTurn.continuation });

    let finalImage: string | undefined;
    if (parsedTurn.imagePrompt) {
      sendEvent("image_prompt", { prompt: parsedTurn.imagePrompt });
      await delay(100);
      sendEvent("turn_status", { status: "image" });
      await streamTurnImage({
        prompt: parsedTurn.imagePrompt,
        signal: abortController.signal,
        onEvent: (event) => {
          if (event.type === "image_generation.partial_image") {
            sendEvent("image_partial", {
              image: `data:image/png;base64,${event.b64_json}`,
              index: event.partial_image_index,
            });
          }
          if (event.type === "image_generation.completed") {
            finalImage = `data:image/png;base64,${event.b64_json}`;
            sendEvent("image_complete", { image: finalImage, usage: event.usage });
          }
        },
      });
    }

    const turn = await appendTurnToGame(game.id, {
      continuation: parsedTurn.continuation,
      imagePrompt: parsedTurn.imagePrompt,
      image: finalImage,
    });

    sendEvent("turn_complete", { turn });
    sendEvent("done", { status: "complete" });
  } catch (error) {
    console.error(error);
    sendEvent("turn_error", {
      message: error instanceof Error ? error.message : "Unable to resolve turn",
    });
  } finally {
    clearInterval(keepAlive);
    res.end();
  }
}

