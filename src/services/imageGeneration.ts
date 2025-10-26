import OpenAI from "openai";
import type { ImageGenStreamEvent } from "openai/resources/images";

type ImageStreamOptions = {
  prompt: string;
  onEvent?: (event: ImageGenStreamEvent) => void;
  signal?: AbortSignal;
};

const referer = process.env.SITE_URL ?? "https://spellbound-party.local";
const siteTitle = process.env.SITE_NAME ?? "Spellbound Party";

let imageClient: OpenAI | null = null;

const getImageClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  if (!imageClient) {
    imageClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      defaultHeaders: {
        "HTTP-Referer": referer,
        "X-Title": siteTitle,
      },
    });
  }

  return imageClient;
};

export async function streamTurnImage({ prompt, onEvent, signal }: ImageStreamOptions) {
  const client = getImageClient();
  const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
  const size = process.env.OPENAI_IMAGE_SIZE ?? "1024x1024";

  const stream = await client.images.generate({
    model,
    prompt,
    size: size as
      | "auto"
      | "1024x1024"
      | "1536x1024"
      | "1024x1536"
      | "256x256"
      | "512x512"
      | "1792x1024"
      | "1024x1792",
    response_format: "b64_json",
    stream: true,
    n: 1,
    partial_images: 1,
    output_format: "png",
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

  let finalBase64: string | null = null;

  try {
    for await (const event of stream) {
      onEvent?.(event);
      if (event.type === "image_generation.completed") {
        finalBase64 = event.b64_json;
      }
    }

    if (!finalBase64) {
      throw new Error("Image generation did not return a result");
    }

    return finalBase64;
  } finally {
    signal?.removeEventListener("abort", abortHandler);
  }
}
