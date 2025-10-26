import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

type AudioStreamOptions = {
  text: string;
  signal?: AbortSignal;
  onChunk?: (audioBase64: string, characterIndex?: number) => void;
};

type AudioChunkWithTimestamps = {
  audioBase64: string; // Note: camelCase, not snake_case
  alignment?: {
    characters: string[];
    characterStartTimesSeconds: number[];
    characterEndTimesSeconds: number[];
  } | null;
  normalizedAlignment?: {
    characters: string[];
    characterStartTimesSeconds: number[];
    characterEndTimesSeconds: number[];
  } | null;
};

let audioClient: ElevenLabsClient | null = null;

const getAudioClient = () => {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  if (!audioClient) {
    audioClient = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY,
    });
  }

  return audioClient;
};

/**
 * Stream audio generation from ElevenLabs with character-level timestamps
 * Returns base64 audio chunks with timing information for synchronized narration
 */
export async function streamTurnAudio({ text, signal, onChunk }: AudioStreamOptions): Promise<void> {
  const client = getAudioClient();

  // Using a natural, storytelling voice
  const voiceId = "kPzsL2i3teMYv0FxEYQ6"; // Chris - Deep and narrative

  console.log("Starting audio generation for text:", text.substring(0, 100));

  try {
    const audioStream = await client.textToSpeech.streamWithTimestamps(voiceId, {
      text,
      modelId: "eleven_v3", // Stable model as per documentation
      outputFormat: "mp3_44100_128",
      voiceSettings: {
        stability: 0.0,
      },
    });

    console.log("Audio stream created successfully");

    // Check for abort signal before starting
    if (signal?.aborted) {
      return;
    }

    let characterIndex = 0;
    let chunkCount = 0;

    // Stream audio chunks with timing info as they arrive
    for await (const chunk of audioStream) {
      if (signal?.aborted) {
        break;
      }

      chunkCount++;

      const typedChunk = chunk as unknown as AudioChunkWithTimestamps;

      if (chunkCount === 1) {
        console.log(`Audio streaming started. First chunk size: ${typedChunk.audioBase64?.length} chars`);
      }

      // Track current character position for highlighting
      if (typedChunk.alignment?.characters) {
        characterIndex += typedChunk.alignment.characters.length;
      }

      // Send chunk to callback if provided
      if (onChunk && typedChunk.audioBase64) {
        onChunk(typedChunk.audioBase64, characterIndex);
      }
    }

    console.log(`Audio generation complete. Total chunks: ${chunkCount}`);
  } catch (error) {
    if (signal?.aborted) {
      // Ignore errors from aborted requests
      return;
    }
    throw error;
  }
}
