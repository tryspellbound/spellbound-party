import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, Badge, Box, Button, Card, Flex, Grid, Heading, Separator, Text } from "@radix-ui/themes";
import { ReloadIcon } from "@radix-ui/react-icons";
import type { GameState, GameTurn } from "@/types/game";

const POLL_INTERVAL = 2000;
const COOLDOWN_SECONDS = 5;

export default function TvGameView() {
  const router = useRouter();
  const { gameId } = router.query;
  const ready = router.isReady && typeof gameId === "string";
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [turns, setTurns] = useState<GameTurn[]>([]);
  const [streamingNarration, setStreamingNarration] = useState("");
  const [streamingImage, setStreamingImage] = useState<string | null>(null);
  const [engineActive, setEngineActive] = useState(false);
  const [engineStatus, setEngineStatus] = useState<"idle" | "running" | "cooldown">("idle");
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [engineError, setEngineError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const playerCount = game?.players.length ?? 0;
  const canAutoRun = game?.status === "in-progress" && playerCount > 0;

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

  useEffect(() => {
    setTurns(game?.turns ?? []);
  }, [game?.turns]);

  const startEngine = () => {
    if (!canAutoRun) return;
    setEngineActive(true);
    setEngineError(null);
  };

  const stopEngine = useCallback(() => {
    setEngineActive(false);
    setEngineStatus("idle");
    setCooldownRemaining(0);
    setStreamingNarration("");
    setStreamingImage(null);
    setEngineError(null);
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  useEffect(() => {
    if (!engineActive || !game?.id) {
      return;
    }

    let cancelled = false;

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const runTurnOnce = () =>
      new Promise<void>((resolve) => {
        const source = new EventSource(`/api/games/${game.id}/turns/stream`);
        sourceRef.current = source;
        setEngineStatus("running");
        setStreamingNarration("");
        setStreamingImage(null);

        const closeSource = () => {
          source.close();
          if (sourceRef.current === source) {
            sourceRef.current = null;
          }
        };

        source.addEventListener("continuation_chunk", (event) => {
          const payload = JSON.parse((event as MessageEvent<string>).data) as { text?: string };
          setStreamingNarration(payload.text ?? "");
        });

        source.addEventListener("image_partial", (event) => {
          const payload = JSON.parse((event as MessageEvent<string>).data) as { image?: string };
          if (payload.image) {
            setStreamingImage(payload.image);
          }
        });

        source.addEventListener("image_complete", (event) => {
          const payload = JSON.parse((event as MessageEvent<string>).data) as { image?: string };
          if (payload.image) {
            setStreamingImage(payload.image);
          }
        });

        source.addEventListener("turn_complete", (event) => {
          const payload = JSON.parse((event as MessageEvent<string>).data) as { turn: GameTurn };
          setTurns((prev) => {
            if (prev.some((t) => t.id === payload.turn.id)) {
              return prev;
            }
            return [...prev, payload.turn];
          });
          setGame((prev) => {
            if (!prev) return prev;
            if (prev.turns?.some((t) => t.id === payload.turn.id)) {
              return prev;
            }
            return { ...prev, turns: [...(prev.turns ?? []), payload.turn] };
          });
        });

        source.addEventListener("turn_error", (event) => {
          const payload = JSON.parse((event as MessageEvent<string>).data) as { message?: string };
          setEngineError(payload.message ?? "Turn generation failed");
          closeSource();
          resolve();
        });

        source.addEventListener("done", () => {
          closeSource();
          resolve();
        });

        source.onerror = () => {
          setEngineError("Turn stream disconnected");
          closeSource();
          resolve();
        };
      });

    const loop = async () => {
      while (!cancelled) {
        await runTurnOnce();
        if (cancelled) break;
        setEngineStatus("cooldown");
        for (let i = COOLDOWN_SECONDS; i > 0; i -= 1) {
          if (cancelled) break;
          setCooldownRemaining(i);
          // eslint-disable-next-line no-await-in-loop
          await wait(1000);
        }
        setCooldownRemaining(0);
        if (!canAutoRun) {
          break;
        }
      }
      if (!cancelled) {
        setEngineStatus("idle");
        setEngineActive(false);
      }
    };

    loop().catch((err) => {
      console.error(err);
      setEngineError("Turn engine failed");
      setEngineStatus("idle");
      setEngineActive(false);
    });

    return () => {
      cancelled = true;
      sourceRef.current?.close();
    };
  }, [engineActive, canAutoRun, game?.id]);

  useEffect(
    () => () => {
      sourceRef.current?.close();
    },
    [],
  );

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
        <Grid columns={{ initial: "1", md: "2" }} gap="4" align="start">
          <Card variant="surface">
            <Flex justify="between" align="center" mb="3">
              <Heading size="4">Players</Heading>
              <Badge color="plum">{playerCount}</Badge>
            </Flex>
            <Flex direction="column" gap="2">
              {game?.players.length ? (
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
              ) : (
                <Text color="gray">Waiting for players to join…</Text>
              )}
            </Flex>
          </Card>
          <Card variant="surface">
            <Flex justify="between" align="center" mb="3">
              <Heading size="4">Turn Engine</Heading>
              <Badge color={engineStatus === "running" ? "lime" : engineStatus === "cooldown" ? "amber" : "gray"}>
                {engineStatus === "running"
                  ? "Streaming"
                  : engineStatus === "cooldown"
                    ? `Cooldown ${cooldownRemaining || ""}`.trim()
                    : "Idle"}
              </Badge>
            </Flex>
            <Text color="gray" size="2" mb="3">
              Streams narration and prompts directly from the storyteller AI. Requires the game to be in progress.
            </Text>
            <Flex gap="2" wrap="wrap" mb="3">
              <Button onClick={startEngine} disabled={!canAutoRun || engineActive}>
                Start Turn Engine
              </Button>
              <Button variant="soft" color="gray" onClick={stopEngine} disabled={!engineActive}>
                Stop
              </Button>
            </Flex>
            {engineError && (
              <Text color="red" size="2" mb="2">
                {engineError}
              </Text>
            )}
            <Box
              style={{
                minHeight: 180,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                padding: "1rem",
                background: "rgba(255,255,255,0.02)",
                overflowY: "auto",
                maxHeight: "40vh",
              }}
            >
              <Text
                size="3"
                style={{
                  whiteSpace: "pre-wrap",
                  color: streamingNarration ? "var(--gray-1, #fdfdfd)" : "var(--gray-11)",
                }}
              >
                {streamingNarration || "Narration will appear here as it streams in."}
              </Text>
            </Box>
            {streamingImage && (
              <Box mt="3" style={{ textAlign: "center" }}>
                <img
                  src={streamingImage}
                  alt="Turn artwork preview"
                  style={{ maxWidth: "100%", borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}
                />
              </Box>
            )}
          </Card>
        </Grid>
        <Card variant="classic">
          <Flex justify="between" align="center" mb="3">
            <Heading size="4">Story Log</Heading>
            <Badge color="iris">{turns.length} turns</Badge>
          </Flex>
          {turns.length === 0 ? (
            <Text color="gray">No turns have been recorded yet. Start the engine to begin!</Text>
          ) : (
            <Flex direction="column" gap="3">
              {turns.map((turn, index) => (
                <Card key={turn.id} variant="surface">
                  <Flex justify="between" align="center" mb="2">
                    <Text weight="bold">Turn {index + 1}</Text>
                    <Text color="gray" size="2">
                      {new Date(turn.createdAt).toLocaleTimeString()}
                    </Text>
                  </Flex>
                  {turn.image && (
                    <Box mb="2" style={{ textAlign: "center" }}>
                      <img
                        src={turn.image}
                        alt={`Turn ${index + 1} illustration`}
                        style={{ maxWidth: "100%", borderRadius: 12 }}
                      />
                    </Box>
                  )}
                  <Text style={{ whiteSpace: "pre-wrap" }}>{turn.continuation}</Text>
                  {turn.imagePrompt && (
                    <Text size="2" color="gray" mt="2">
                      Image prompt: {turn.imagePrompt}
                    </Text>
                  )}
                </Card>
              ))}
            </Flex>
          )}
        </Card>
      </Flex>
    </Box>
  );
}
