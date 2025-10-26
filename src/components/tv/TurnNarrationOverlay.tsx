import { Box, Text } from "@radix-ui/themes";
import { useEffect, useRef, useState, useMemo } from "react";

type TurnNarrationOverlayProps = {
  text: string;
  prompt?: string;
  variantKey: string;
  audioPlaybackTime?: number;
  audioAlignment?: {
    characters: string[];
    characterStartTimesSeconds: number[];
    characterEndTimesSeconds: number[];
  } | null;
};

export default function TurnNarrationOverlay({
  text,
  prompt,
  variantKey,
  audioPlaybackTime = 0,
  audioAlignment = null,
}: TurnNarrationOverlayProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [animate, setAnimate] = useState(false);

  // Calculate how many characters have been spoken based on playback time
  const spokenCharacterCount = useMemo(() => {
    if (!audioAlignment || audioPlaybackTime === 0) {
      return 0;
    }

    // Find the last character whose end time is less than current playback time
    let count = 0;
    for (let i = 0; i < audioAlignment.characterEndTimesSeconds.length; i++) {
      if (audioAlignment.characterEndTimesSeconds[i] <= audioPlaybackTime) {
        count = i + 1;
      } else {
        break;
      }
    }
    return count;
  }, [audioAlignment, audioPlaybackTime]);

  // Split text into spoken and unspoken portions
  const { spokenText, unspokenText } = useMemo(() => {
    if (!audioAlignment || spokenCharacterCount === 0) {
      return { spokenText: "", unspokenText: text };
    }

    // Reconstruct text from alignment characters
    const alignmentText = audioAlignment.characters.join("");

    // If alignment text matches our text, use it directly
    if (alignmentText === text || text.startsWith(alignmentText)) {
      const spoken = alignmentText.slice(0, spokenCharacterCount);
      const unspoken = text.slice(spokenCharacterCount);
      return { spokenText: spoken, unspokenText: unspoken };
    }

    // Fallback: use character count on original text
    const spoken = text.slice(0, spokenCharacterCount);
    const unspoken = text.slice(spokenCharacterCount);
    return { spokenText: spoken, unspokenText: unspoken };
  }, [text, audioAlignment, spokenCharacterCount]);

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
            display: "block",
          }}
        >
          {spokenText && (
            <span
              style={{
                color: "var(--gray-1)",
                textShadow: "0 0 20px rgba(255, 255, 255, 0.3)",
                transition: "color 0.15s ease-out",
              }}
            >
              {spokenText}
            </span>
          )}
          {unspokenText && (
            <span
              style={{
                color: "var(--gray-9)",
                transition: "color 0.15s ease-out",
              }}
            >
              {unspokenText}
            </span>
          )}
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

