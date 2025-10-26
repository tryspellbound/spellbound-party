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

  // Auto-scroll to bottom as text updates
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
        padding: "3rem",
        background: "linear-gradient(180deg, transparent 0%, var(--black-a11) 30%, var(--black-a12) 60%)",
        minHeight: "50%",
        maxHeight: "80%",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        backdropFilter: "blur(8px)",
      }}
    >
      <Box
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          paddingRight: "1rem",
          maskImage: "linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%)",
        }}
      >
        <Text
          size="7"
          style={{
            whiteSpace: "pre-wrap",
            lineHeight: 1.6,
            color: "var(--gray-11)",
            display: "block",
          }}
        >
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
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        /* Custom scrollbar styling */
        .turn-overlay ::-webkit-scrollbar {
          width: 8px;
        }
        .turn-overlay ::-webkit-scrollbar-track {
          background: transparent;
        }
        .turn-overlay ::-webkit-scrollbar-thumb {
          background: var(--gray-8);
          border-radius: 4px;
        }
        .turn-overlay ::-webkit-scrollbar-thumb:hover {
          background: var(--gray-9);
        }
      `}</style>
    </Box>
  );
}

