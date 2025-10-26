import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, Badge, Box, Button, Card, Flex, Grid, Heading, Separator, Text } from "@radix-ui/themes";
import { ReloadIcon } from "@radix-ui/react-icons";
import type { GameState } from "@/types/game";

const POLL_INTERVAL = 2000;

export default function TvGameView() {
  const router = useRouter();
  const { gameId } = router.query;
  const ready = router.isReady && typeof gameId === "string";
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const playerCount = game?.players.length ?? 0;

  const joinUrl = useMemo(() => {
    if (!game?.id) return "";
    if (typeof window !== "undefined") {
      return `${window.location.origin}/play/${game.id}`;
    }
    return `/play/${game.id}`;
  }, [game?.id]);

  const fetchGame = useCallback(
    async (silent = false) => {
      if (!ready || typeof gameId !== "string") return;
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const res = await fetch(`/api/games/${gameId}`);
        if (!res.ok) {
          throw new Error("Unable to load game");
        }
        const data = (await res.json()) as { game: GameState };
        setGame(data.game);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Unable to load game");
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [gameId, ready],
  );

  useEffect(() => {
    fetchGame(true);
  }, [fetchGame]);

  useEffect(() => {
    if (!ready || typeof gameId !== "string") return;
    const interval = setInterval(() => fetchGame(true), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchGame, ready, gameId]);

  if (!ready) {
    return null;
  }

  return (
    <Box
      p={{ initial: "4", sm: "7" }}
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(21,94,239,0.15), transparent 55%), #02010a",
      }}
    >
      <Flex direction="column" gap="3">
        <Flex justify="between" align="center" wrap="wrap" gap="4">
          <Box>
            <Text color="gray" size="2">
              Game Code
            </Text>
            <Heading size="9">{typeof gameId === "string" ? gameId : "--"}</Heading>
            <Text color="gray" size="2">
              Share {joinUrl || "the join link"}
            </Text>
          </Box>
          <Flex gap="3" align="center">
            <Badge size="3" color="plum">
              {playerCount} {playerCount === 1 ? "Player" : "Players"}
            </Badge>
            <Button variant="soft" onClick={() => fetchGame(false)} loading={loading}>
              <ReloadIcon />
              Refresh
            </Button>
          </Flex>
        </Flex>
        <Separator size="4" />
        {error && (
          <Card variant="classic">
            <Text color="red">{error}</Text>
          </Card>
        )}
        <Grid columns={{ initial: "1", md: "2" }} gap="4">
          {game?.players.length ? (
            game.players.map((player) => (
              <Card key={player.id} variant="surface">
                <Flex justify="between" align="center" gap="3">
                  <Flex align="center" gap="3">
                    <Avatar
                      size="3"
                      radius="full"
                      src={player.avatar}
                      fallback={(player.name[0] ?? "?").toUpperCase()}
                    />
                    <Text weight="bold" size="5">
                      {player.name}
                    </Text>
                  </Flex>
                  <Text color="gray" size="2">
                    {new Date(player.joinedAt).toLocaleTimeString()}
                  </Text>
                </Flex>
              </Card>
            ))
          ) : (
            <Card variant="surface">
              <Text color="gray">Waiting for players to join…</Text>
            </Card>
          )}
        </Grid>
      </Flex>
    </Box>
  );
}
