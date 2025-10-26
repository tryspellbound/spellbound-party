import { Box, Text } from "@radix-ui/themes";
import TurnNarrationOverlay from "./TurnNarrationOverlay";

type TurnShowcaseProps = {
  imageSrc?: string | null;
  narration: string;
  prompt?: string;
  variantKey: string;
};

export default function TurnShowcase({ imageSrc, narration, prompt, variantKey }: TurnShowcaseProps) {
  return (
    <Box
      style={{
        position: "relative",
        borderRadius: "32px",
        overflow: "hidden",
        boxShadow: "0 40px 130px rgba(10,6,29,0.45)",
        minHeight: "65vh",
        background: "radial-gradient(circle at top, rgba(66,43,255,0.2), #050312 70%)",
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
            color: "rgba(255,255,255,0.7)",
            fontSize: "1.2rem",
            textAlign: "center",
            padding: "2rem",
          }}
        >
          <Text size="4" color="gray">
            Awaiting the next illustration…
          </Text>
        </Box>
      )}
      <TurnNarrationOverlay text={narration} prompt={prompt} variantKey={variantKey} />
    </Box>
  );
}

