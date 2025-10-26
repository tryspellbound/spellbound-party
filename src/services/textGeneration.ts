import OpenAI from "openai";

type StreamOptions = {
  systemPrompt: string;
  userPrompt: string;
  onChunk?: (chunk: string, accumulated: string) => void;
  signal?: AbortSignal;
};

const referer = process.env.SITE_URL ?? "https://spellbound-party.local";
const siteTitle = process.env.SITE_NAME ?? "Spellbound Party";

let textClient: OpenAI | null = null;

const getTextClient = () => {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  if (!textClient) {
    textClient = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        "HTTP-Referer": referer,
        "X-Title": siteTitle,
      },
    });
  }

  return textClient;
};

export async function streamTurnText({
  systemPrompt,
  userPrompt,
  onChunk,
  signal,
}: StreamOptions): Promise<string> {
  const client = getTextClient();
  const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

  const stream = await client.responses.stream({
    model,
    temperature: 0.85,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const abortHandler = () => {
    stream.controller.abort();
  };

  if (signal) {
    if (signal.aborted) {
      abortHandler();
    } else {
      signal.addEventListener("abort", abortHandler);
    }
  }

  let buffer = "";

  try {
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        const chunk = event.delta ?? "";
        if (chunk) {
          buffer += chunk;
          onChunk?.(chunk, buffer);
        }
      } else if ((event as { error?: { message?: string } }).error) {
        const err = (event as { error?: { message?: string } }).error;
        throw new Error(err?.message ?? "Narration generation failed");
      }
    }

    const finalResponse = await stream.finalResponse();
    if (!buffer && finalResponse?.output_text) {
      const output = finalResponse.output_text;
      buffer = Array.isArray(output) ? output.join("") : output;
    }

    return buffer.trim();
  } finally {
    if (signal) {
      signal.removeEventListener("abort", abortHandler);
    }
  }
}
