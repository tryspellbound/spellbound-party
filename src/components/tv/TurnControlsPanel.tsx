import { Badge, Box, Button, Card, Flex, Heading, Separator, Text, Tooltip } from "@radix-ui/themes";
import type { GameTurn } from "@/types/game";

type TurnControlsPanelProps = {
  engineStatus: "idle" | "running" | "cooldown";
  engineActive: boolean;
  cooldownRemaining: number;
  canRun: boolean;
  onStart: () => void;
  onStop: () => void;
  engineError?: string | null;
  turns: GameTurn[];
};

const statusCopy: Record<TurnControlsPanelProps["engineStatus"], string> = {
  idle: "Idle",
  running: "Streaming",
  cooldown: "Cooling down",
};

const statusColor: Record<TurnControlsPanelProps["engineStatus"], "gray" | "lime" | "amber"> = {
  idle: "gray",
  running: "lime",
  cooldown: "amber",
};

export default function TurnControlsPanel({
  engineStatus,
  engineActive,
  cooldownRemaining,
  canRun,
  onStart,
  onStop,
  engineError,
  turns,
}: TurnControlsPanelProps) {
  const recentTurns = turns.slice(-4).reverse();

  return (
    <Card variant="surface" style={{ width: "100%" }}>
      <Flex justify="between" align="center" mb="3">
        <Heading size="4">Turn Engine</Heading>
        <Badge color={statusColor[engineStatus]}>{engineStatus === "cooldown" ? `${statusCopy[engineStatus]} ${cooldownRemaining}s` : statusCopy[engineStatus]}</Badge>
      </Flex>
      <Text size="2" color="gray" mb="3">
        Auto-generates narration and art for each beat. Keep the engine running to advance the tale.
      </Text>
      <Flex gap="2" wrap="wrap" mb="3">
        <Button onClick={onStart} disabled={!canRun || engineActive}>
          Start
        </Button>
        <Button variant="soft" color="gray" onClick={onStop} disabled={!engineActive}>
          Stop
        </Button>
      </Flex>
      {engineError && (
        <Text color="red" size="2" mb="3">
          {engineError}
        </Text>
      )}
      <Separator size="4" mb="3" />
      <Flex justify="between" align="center" mb="2">
        <Text weight="bold">Recent turns</Text>
        <Text size="2" color="gray">
          {turns.length} total
        </Text>
      </Flex>
      {recentTurns.length === 0 ? (
        <Text size="2" color="gray">
          None yet—start the engine to craft the first chapter.
        </Text>
      ) : (
        <Flex direction="column" gap="2">
          {recentTurns.map((turn, idx) => (
            <Card key={turn.id} variant="classic">
              <Flex justify="between" align="center" gap="3">
                <Box>
                  <Text weight="bold">Turn {turns.length - idx}</Text>
                  {turn.imagePrompt && (
                    <Text size="2" color="gray">
                      {turn.imagePrompt.length > 48 ? `${turn.imagePrompt.slice(0, 48)}…` : turn.imagePrompt}
                    </Text>
                  )}
                </Box>
                <Tooltip content={new Date(turn.createdAt).toLocaleTimeString()}>
                  <Text size="2" color="gray">
                    {new Date(turn.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </Tooltip>
              </Flex>
            </Card>
          ))}
        </Flex>
      )}
    </Card>
  );
}

