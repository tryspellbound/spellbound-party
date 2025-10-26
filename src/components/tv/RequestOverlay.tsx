import { useEffect, useState } from "react";
import { Box, Flex, Heading, Text, Card } from "@radix-ui/themes";
import type { Request, RequestResponse, Player } from "@/types/game";

type RequestOverlayProps = {
  requests: Request[];
  responses: Record<string, RequestResponse[]>;
  players: Player[];
  onComplete?: () => void;
  maxSeconds?: number;
};

export default function RequestOverlay({
  requests,
  responses,
  players,
  onComplete,
  maxSeconds = 30,
}: RequestOverlayProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(maxSeconds);

  // Calculate which players need to respond
  const playersNeedingResponse = new Set<string>();
  for (const request of requests) {
    if (request.type === "multiple_choice") {
      // All players need to respond
      for (const player of players) {
        playersNeedingResponse.add(player.id);
      }
    } else if (request.targetPlayers) {
      // Specific players need to respond
      for (const playerId of request.targetPlayers) {
        playersNeedingResponse.add(playerId);
      }
    }
  }

  // Calculate who has responded
  const playersWhoResponded = new Set<string>();
  for (const requestResponses of Object.values(responses)) {
    for (const response of requestResponses) {
      if (response.response !== null) {
        playersWhoResponded.add(response.playerId);
      }
    }
  }

  // Check if all responses are in
  const allResponsesReceived = Array.from(playersNeedingResponse).every((playerId) =>
    playersWhoResponded.has(playerId)
  );

  // Countdown timer
  useEffect(() => {
    if (allResponsesReceived) {
      onComplete?.();
      return;
    }

    if (secondsRemaining <= 0) {
      onComplete?.();
      return;
    }

    const timer = setTimeout(() => {
      setSecondsRemaining((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [secondsRemaining, allResponsesReceived, onComplete]);

  // Get player details for those needing responses
  const playersList = players.filter((p) => playersNeedingResponse.has(p.id));

  return (
    <Box
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: "2rem",
      }}
    >
      <Card size="4" style={{ maxWidth: "600px", width: "100%" }}>
        <Flex direction="column" gap="5" align="center">
          <Box style={{ textAlign: "center" }}>
            <Heading size="8" mb="2">
              Check Your Phones!
            </Heading>
            <Text size="4" color="gray">
              Waiting for player responses...
            </Text>
          </Box>

          {/* Countdown timer */}
          <Box
            style={{
              width: "120px",
              height: "120px",
              borderRadius: "50%",
              border: "4px solid var(--accent-9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            <Text size="9" weight="bold" style={{ fontSize: "3rem" }}>
              {secondsRemaining}
            </Text>
          </Box>

          {/* Player list */}
          <Box style={{ width: "100%" }}>
            <Text size="3" weight="bold" mb="3" style={{ display: "block" }}>
              Players:
            </Text>
            <Flex direction="column" gap="2">
              {playersList.map((player) => {
                const hasResponded = playersWhoResponded.has(player.id);
                return (
                  <Flex
                    key={player.id}
                    align="center"
                    justify="between"
                    p="3"
                    style={{
                      backgroundColor: hasResponded ? "var(--green-3)" : "var(--gray-3)",
                      borderRadius: "8px",
                      border: hasResponded ? "2px solid var(--green-9)" : "2px solid transparent",
                    }}
                  >
                    <Text weight="medium">{player.name}</Text>
                    {hasResponded ? (
                      <Text style={{ fontSize: "1.5rem", color: "var(--green-11)" }}>✓</Text>
                    ) : (
                      <Text color="gray" size="2">
                        Waiting...
                      </Text>
                    )}
                  </Flex>
                );
              })}
            </Flex>
          </Box>

          {/* Progress indicator */}
          <Box style={{ width: "100%" }}>
            <Flex justify="between" mb="2">
              <Text size="2" color="gray">
                Progress
              </Text>
              <Text size="2" weight="bold">
                {playersWhoResponded.size} / {playersNeedingResponse.size}
              </Text>
            </Flex>
            <Box
              style={{
                width: "100%",
                height: "8px",
                backgroundColor: "var(--gray-5)",
                borderRadius: "4px",
                overflow: "hidden",
              }}
            >
              <Box
                style={{
                  width: `${(playersWhoResponded.size / playersNeedingResponse.size) * 100}%`,
                  height: "100%",
                  backgroundColor: "var(--accent-9)",
                  transition: "width 0.3s ease",
                }}
              />
            </Box>
          </Box>
        </Flex>
      </Card>
    </Box>
  );
}
