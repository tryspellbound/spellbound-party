import { Avatar, Badge, Box, Card, Flex, Heading, Text } from "@radix-ui/themes";
import type { Player } from "@/types/game";

type PlayerListPanelProps = {
  players: Player[];
  gameCode?: string;
  joinUrl?: string;
};

export default function PlayerListPanel({ players, gameCode, joinUrl }: PlayerListPanelProps) {
  return (
    <Card
      variant="surface"
      style={{
        minHeight: "75vh",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <Heading size="4">Adventurers</Heading>
      <Flex direction="column" gap="3" style={{ flex: 1 }}>
        {players.length === 0 ? (
          <Flex
            align="center"
            justify="center"
            style={{
              borderRadius: 12,
              border: "1px dashed rgba(255,255,255,0.2)",
              padding: "2rem 1rem",
            }}
          >
            <Text color="gray" align="center">
              No heroes yet.
              <br />
              Share the code to gather the party.
            </Text>
          </Flex>
        ) : (
          <Flex direction="column" gap="2">
            {players.map((player) => (
              <Card key={player.id} variant="classic">
                <Flex align="center" justify="between" gap="3">
                  <Flex align="center" gap="3">
                    <Avatar
                      size="3"
                      radius="full"
                      src={player.avatar}
                      fallback={(player.name[0] ?? "?").toUpperCase()}
                    />
                    <Text weight="bold">{player.name}</Text>
                  </Flex>
                  <Text size="2" color="gray">
                    {new Date(player.joinedAt).toLocaleTimeString()}
                  </Text>
                </Flex>
              </Card>
            ))}
          </Flex>
        )}
      </Flex>
      <Box>
        <Text size="2" color="gray">
          Lobby Code
        </Text>
        <Flex align="center" gap="2" mt="1">
          <Badge color="iris" radius="full">
            {gameCode ?? "--"}
          </Badge>
          {joinUrl && (
            <Text
              size="2"
              color="gray"
              title={joinUrl}
              style={{ maxWidth: "160px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {joinUrl}
            </Text>
          )}
        </Flex>
      </Box>
    </Card>
  );
}
