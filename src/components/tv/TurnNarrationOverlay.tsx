import { Box, Text } from "@radix-ui/themes";
import { useEffect, useRef, useState } from "react";

type TurnNarrationOverlayProps = {
  text: string;
  prompt?: string;
  variantKey: string;
};

export default function TurnNarrationOverlay({ text, prompt, variantKey }: TurnNarrationOverlayProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  useEffect(() => {
    setAnimate(true);
    const timeout = setTimeout(() => setAnimate(false), 600);
    return () => clearTimeout(timeout);
  }, [variantKey]);

  return (
    <Box
      className={`turn-overlay ${animate ? "turn-overlay--animate" : ""}`}
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "1.5rem",
        background: "linear-gradient(180deg, rgba(3,3,12,0) 0%, rgba(2,2,10,0.95) 45%)",
        borderBottomLeftRadius: "32px",
        borderBottomRightRadius: "32px",
        minHeight: "40%",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        backdropFilter: "blur(4px)",
      }}
    >
      {prompt && (
        <Text
          size="2"
          color="gray"
          style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}
        >
          {prompt}
        </Text>
      )}
      <Box
        ref={scrollRef}
        style={{
          maxHeight: "calc(40vh - 3rem)",
          overflowY: "auto",
          paddingRight: "0.5rem",
          color: "var(--gray-1, #fdfdfd)",
        }}
      >
        <Text size="5" style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}>
          {text}
        </Text>
      </Box>
      <style jsx>{`
        .turn-overlay--animate {
          animation: fadeInOverlay 0.6s ease forwards;
        }
        @keyframes fadeInOverlay {
          from {
            opacity: 0.4;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </Box>
  );
}

