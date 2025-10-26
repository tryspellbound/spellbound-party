import { Avatar, Box, Button, Flex, ScrollArea, Separator, Text } from "@radix-ui/themes";
import type { Player } from "@/types/game";

type PlayerListPanelProps = {
  players: Player[];
  engineStatus: "idle" | "running" | "cooldown";
  engineActive: boolean;
  cooldownRemaining: number;
  canRun: boolean;
  onStart: () => void;
  onStop: () => void;
  engineError?: string | null;
};

export default function PlayerListPanel({
  players,
  engineStatus,
  engineActive,
  cooldownRemaining,
  canRun,
  onStart,
  onStop,
  engineError,
}: PlayerListPanelProps) {
  return (
    <Flex
      direction="column"
      style={{
        height: "100%",
        padding: "1.5rem",
        gap: "1.5rem",
      }}
    >
      {/* Players Section */}
      <Box style={{ flex: 1, minHeight: 0 }}>
        <Text size="2" weight="bold" mb="3" style={{ display: "block", color: "var(--gray-11)" }}>
          Adventurers
        </Text>
        <ScrollArea style={{ height: "100%" }}>
          <Flex direction="column" gap="2">
            {players.length === 0 ? (
              <Text size="2" style={{ color: "var(--gray-9)" }}>
                Waiting for players...
              </Text>
            ) : (
              players.map((player) => (
                <Flex key={player.id} align="center" gap="2">
                  <Avatar
                    size="2"
                    radius="full"
                    src={player.avatar}
                    fallback={(player.name[0] ?? "?").toUpperCase()}
                  />
                  <Text size="2" weight="medium" style={{ color: "var(--gray-12)" }}>
                    {player.name}
                  </Text>
                </Flex>
              ))
            )}
          </Flex>
        </ScrollArea>
      </Box>

      <Separator size="4" />

      {/* Controls Section */}
      <Box>
        <Text size="2" weight="bold" mb="3" style={{ display: "block", color: "var(--gray-11)" }}>
          Turn Engine
        </Text>
        <Flex direction="column" gap="2">
          <Flex gap="2">
            <Button onClick={onStart} disabled={!canRun || engineActive} size="2" style={{ flex: 1 }}>
              Start
            </Button>
            <Button
              variant="soft"
              color="gray"
              onClick={onStop}
              disabled={!engineActive}
              size="2"
              style={{ flex: 1 }}
            >
              Stop
            </Button>
          </Flex>
          {engineStatus !== "idle" && (
            <Text size="1" style={{ color: "var(--gray-10)" }}>
              {engineStatus === "running"
                ? "Generating..."
                : `Cooldown: ${cooldownRemaining}s`}
            </Text>
          )}
          {engineError && (
            <Text size="1" style={{ color: "var(--red-9)" }}>
              {engineError}
            </Text>
          )}
        </Flex>
      </Box>
    </Flex>
  );
}
