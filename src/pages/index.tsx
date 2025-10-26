import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, Box, Button, Card, Flex, Grid, Heading, Inset, Separator, Text, Badge } from "@radix-ui/themes";
import { RocketIcon } from "@radix-ui/react-icons";
import QRCode from "react-qr-code";
import type { GameState } from "@/types/game";

type GameResponse = {
  game: GameState;
  joinUrl: string;
};

const POLL_INTERVAL = 2000;

export default function TvLobby() {
  const router = useRouter();
  const [game, setGame] = useState<GameState | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qrValue = useMemo(() => {
    if (joinUrl) return joinUrl;
    if (!game) return "";
    if (typeof window !== "undefined") {
      return `${window.location.origin}/play/${game.id}`;
    }
    return `/play/${game.id}`;
  }, [game, joinUrl]);

  const fetchGame = useCallback(
    async (gameId: string) => {
      try {
        const res = await fetch(`/api/games/${gameId}`);
        if (!res.ok) {
          throw new Error("Failed to load game");
        }
        const data = (await res.json()) as { game: GameState };
        setGame(data.game);
      } catch (err) {
        console.error(err);
      }
    },
    [setGame],
  );

  useEffect(() => {
    if (!game?.id) return;
    const interval = setInterval(() => fetchGame(game.id), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [game?.id, fetchGame]);

  const handleCreateGame = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/games", { method: "POST" });
      if (!res.ok) {
        throw new Error("Unable to create game");
      }
      const data = (await res.json()) as GameResponse;
      setGame(data.game);
      setJoinUrl(data.joinUrl);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  const handleStartGame = async () => {
    if (!game) return;
    setStartLoading(true);
    try {
      await fetch(`/api/games/${game.id}/start`, { method: "POST" });
      router.push(`/tv/${game.id}`);
    } catch (err) {
      console.error(err);
      setError("Unable to start game");
    } finally {
      setStartLoading(false);
    }
  };

  return (
    <Box
      p={{ initial: "5", sm: "7" }}
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(80,72,225,0.25), transparent 55%), #040208",
      }}
    >
      <Flex direction="column" gap="4" align="center">
        <Heading size="8" weight="bold">
          Spellbound Party
        </Heading>
        <Text color="gray" size="4">
          Spin up a lobby, share the QR code, and let friends jump in.
        </Text>
        {!game ? (
          <Card size="5" variant="surface" style={{ maxWidth: 560, marginTop: "3rem" }}>
            <Flex direction="column" gap="5" align="center">
              <Text size="6" weight="bold">
                Ready to Cast a Spell?
              </Text>
              <Text align="center" size="3" color="gray">
                Create a lobby from the TV to start gathering players. Once created, you will get a
                QR code and a join link to share.
              </Text>
              <Button size="4" onClick={handleCreateGame} loading={loading}>
                Create Game
              </Button>
              {error && (
                <Text color="red" size="3">
                  {error}
                </Text>
              )}
            </Flex>
          </Card>
        ) : (
          <Grid
            gap="5"
            columns={{ initial: "1", sm: "2" }}
            style={{ width: "100%", maxWidth: 960 }}
          >
            <Card variant="surface">
              <Flex direction="column" gap="4">
                <Flex justify="between" align="center">
                  <Box>
                    <Text size="2" color="gray">
                      Lobby Code
                    </Text>
                    <Heading size="7" mt="1">
                      {game.id}
                    </Heading>
                  </Box>
                  <Badge color={game.status === "lobby" ? "lime" : "plum"} radius="full">
                    {game.status === "lobby" ? "Waiting" : "In progress"}
                  </Badge>
                </Flex>
                <Separator size="4" />
                <Flex direction="column" gap="3">
                  <Text color="gray" size="2">
                    Players
                  </Text>
                  <Flex direction="column" gap="2">
                    {game.players.length === 0 ? (
                      <Text color="gray">No players yet — share the QR code!</Text>
                    ) : (
                      game.players.map((player) => (
                        <Card key={player.id} variant="classic">
                          <Flex justify="between" align="center" gap="3">
                            <Flex align="center" gap="3">
                              <Avatar
                                size="3"
                                radius="full"
                                src={player.avatar}
                                fallback={(player.name[0] ?? "?").toUpperCase()}
                              />
                              <Box>
                                <Text weight="bold">{player.name}</Text>
                                <Text color="gray" size="2">
                                  Joined {new Date(player.joinedAt).toLocaleTimeString()}
                                </Text>
                              </Box>
                            </Flex>
                          </Flex>
                        </Card>
                      ))
                    )}
                  </Flex>
                </Flex>
              </Flex>
            </Card>
            <Card variant="surface">
              <Flex direction="column" gap="4" align="center">
                <Text color="gray" size="2">
                  Scan to join
                </Text>
                <Inset clip="padding-box" side="all" style={{ background: "white", padding: 16 }}>
                  <QRCode value={qrValue || "pending"} size={220} />
                </Inset>
                <Text size="2" color="gray">
                  Or visit <Text as="span" weight="bold">{joinUrl || "Loading link..."}</Text>
                </Text>
                <Button
                  size="4"
                  onClick={handleStartGame}
                  disabled={game.players.length === 0}
                  loading={startLoading}
                >
                  <RocketIcon />
                  Start Game
                </Button>
                {error && (
                  <Text color="red" size="2">
                    {error}
                  </Text>
                )}
              </Flex>
            </Card>
          </Grid>
        )}
      </Flex>
    </Box>
  );
}
