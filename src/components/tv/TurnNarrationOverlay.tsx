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
  // Add 50ms lookahead so the current word is always highlighted
  const spokenCharacterCount = useMemo(() => {
    if (!audioAlignment || audioPlaybackTime === 0) {
      return 0;
    }

    const LOOKAHEAD_SECONDS = 0.02; // 50ms lookahead
    const adjustedPlaybackTime = audioPlaybackTime + LOOKAHEAD_SECONDS;

    // Find the last character whose end time is less than current playback time
    let count = 0;
    for (let i = 0; i < audioAlignment.characterEndTimesSeconds.length; i++) {
      if (audioAlignment.characterEndTimesSeconds[i] <= adjustedPlaybackTime) {
        count = i + 1;
      } else {
        break;
      }
    }
    return count;
  }, [audioAlignment, audioPlaybackTime]);

  // Parse text into word segments (words + attached punctuation)
  // A word segment is any sequence of non-whitespace characters
  // Also identify and mark bracketed sections for hiding
  const wordSegments = useMemo(() => {
    // First, identify all bracket regions [...]
    const bracketRegions: { start: number; end: number }[] = [];
    const bracketRegex = /\[([^\]]*)\]/g;
    let bracketMatch;

    while ((bracketMatch = bracketRegex.exec(text)) !== null) {
      bracketRegions.push({
        start: bracketMatch.index,
        end: bracketMatch.index + bracketMatch[0].length,
      });
    }

    // Helper to check if a position is inside brackets
    const isInBrackets = (index: number) => {
      return bracketRegions.some((region) => index >= region.start && index < region.end);
    };

    const segments: { text: string; startIndex: number; endIndex: number }[] = [];

    // Match sequences of non-whitespace characters, but split on em-dash
    const wordRegex = /[^\s—]+/g;
    let match;

    while ((match = wordRegex.exec(text)) !== null) {
      segments.push({
        text: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }

    // Also capture whitespace between words
    const allSegments: {
      text: string;
      startIndex: number;
      endIndex: number;
      isWhitespace: boolean;
      inBrackets: boolean;
    }[] = [];
    let lastEnd = 0;

    for (const segment of segments) {
      // Add whitespace before this segment
      if (segment.startIndex > lastEnd) {
        allSegments.push({
          text: text.slice(lastEnd, segment.startIndex),
          startIndex: lastEnd,
          endIndex: segment.startIndex,
          isWhitespace: true,
          inBrackets: isInBrackets(lastEnd),
        });
      }
      // Add the word segment
      allSegments.push({
        ...segment,
        isWhitespace: false,
        inBrackets: isInBrackets(segment.startIndex),
      });
      lastEnd = segment.endIndex;
    }

    // Add trailing whitespace if any
    if (lastEnd < text.length) {
      allSegments.push({
        text: text.slice(lastEnd),
        startIndex: lastEnd,
        endIndex: text.length,
        isWhitespace: true,
        inBrackets: isInBrackets(lastEnd),
      });
    }

    return allSegments;
  }, [text]);

  // Determine which segments are spoken
  const highlightedSegments = useMemo(() => {
    if (!audioAlignment || spokenCharacterCount === 0) {
      return wordSegments.map((seg) => ({ ...seg, isSpoken: false }));
    }

    return wordSegments.map((segment) => {
      // Whitespace is spoken if it's before the spoken character count
      if (segment.isWhitespace) {
        return {
          ...segment,
          isSpoken: segment.endIndex <= spokenCharacterCount,
        };
      }

      // A word is spoken if ANY of its characters have been spoken
      const wordHasBeenStarted = segment.startIndex < spokenCharacterCount;
      return {
        ...segment,
        isSpoken: wordHasBeenStarted,
      };
    });
  }, [wordSegments, audioAlignment, spokenCharacterCount]);

  // Auto-scroll to keep the current spoken word in view
  const currentWordRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!currentWordRef.current || !scrollRef.current) {
      return;
    }

    const scrollContainer = scrollRef.current;
    const currentWord = currentWordRef.current;

    // Get positions
    const containerRect = scrollContainer.getBoundingClientRect();
    const wordRect = currentWord.getBoundingClientRect();

    // Calculate if we need to scroll
    const wordBottom = wordRect.bottom - containerRect.top;
    const containerHeight = containerRect.height;

    // Add ~1 line margin (60px) so it scrolls before the word reaches the bottom
    const scrollMargin = 60;

    // If the word is near the bottom, scroll it into view
    if (wordBottom > containerHeight - scrollMargin) {
      currentWord.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [spokenCharacterCount]);

  // Initial scroll to bottom when text changes
  useEffect(() => {
    if (scrollRef.current && !audioAlignment) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text, audioAlignment]);

  useEffect(() => {
    setAnimate(true);
    const timeout = setTimeout(() => setAnimate(false), 600);
    return () => clearTimeout(timeout);
  }, [variantKey]);

  // Find the index of the first unspoken word (for scroll ref)
  const firstUnspokenWordIndex = highlightedSegments.findIndex(
    (seg) => !seg.isWhitespace && !seg.isSpoken
  );

  return (
    <Box
      className={`turn-overlay ${animate ? "turn-overlay--animate" : ""}`}
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "3rem",
        background: "linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.5) 30%, rgba(0, 0, 0, 0.5) 60%)",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <Box
        ref={scrollRef}
        style={{
          overflowY: "auto",
          overflowX: "hidden",
          paddingRight: "1rem",
          // 4 lines at line-height 1.6 + size 7 (approx 2.5rem per line)
          maxHeight: "calc(1.6 * 2.5rem * 4)",
          maskImage: "linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%)",
        }}
      >
        <Text
          size="8"
          style={{
            whiteSpace: "pre-wrap",
            lineHeight: 1.8,
            display: "block",
            fontFamily: "var(--font-luxurious-roman), serif",
          }}
        >
          {highlightedSegments.map((segment, index) => {
            const isCurrentWord = index === firstUnspokenWordIndex;
            const prevSegment = index > 0 ? highlightedSegments[index - 1] : null;

            // Hide bracketed content
            if (segment.inBrackets) {
              return (
                <span key={index} style={{ display: "none" }}>
                  {segment.text}
                </span>
              );
            }

            // Hide whitespace that immediately follows a bracketed segment
            if (segment.isWhitespace && prevSegment?.inBrackets) {
              return (
                <span key={index} style={{ display: "none" }}>
                  {segment.text}
                </span>
              );
            }

            return (
              <span
                key={index}
                ref={isCurrentWord ? currentWordRef : undefined}
                style={{
                  color: segment.isSpoken ? "var(--gray-12)" : "var(--gray-11)",
                  textShadow: segment.isSpoken ? "0 0 20px rgba(255, 255, 255, 0.3)" : "none",
                  transition: "color 0.15s ease-out, text-shadow 0.15s ease-out",
                }}
              >
                {segment.text}
              </span>
            );
          })}
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

