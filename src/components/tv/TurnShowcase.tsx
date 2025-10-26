import { Box, Text } from "@radix-ui/themes";
import TurnNarrationOverlay from "./TurnNarrationOverlay";

type TurnShowcaseProps = {
  imageSrc?: string | null;
  narration: string;
  prompt?: string;
  variantKey: string;
  audioPlaybackTime?: number;
  audioAlignment?: {
    characters: string[];
    characterStartTimesSeconds: number[];
    characterEndTimesSeconds: number[];
  } | null;
};

export default function TurnShowcase({ imageSrc, narration, prompt, variantKey, audioPlaybackTime = 0, audioAlignment = null }: TurnShowcaseProps) {
  return (
    <Box
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: "var(--black-a12)",
      }}
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt="Current turn artwork"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        <Box
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text size="4" style={{ color: "var(--gray-8)" }}>
            Awaiting artwork...
          </Text>
        </Box>
      )}
      <TurnNarrationOverlay
        text={narration}
        prompt={prompt}
        variantKey={variantKey}
        audioPlaybackTime={audioPlaybackTime}
        audioAlignment={audioAlignment}
      />
    </Box>
  );
}

