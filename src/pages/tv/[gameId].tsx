import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Box, Flex, Heading, Text } from "@radix-ui/themes";
import type { GameState, GameTurn } from "@/types/game";
import PlayerListPanel from "@/components/tv/PlayerListPanel";
import TurnControlsPanel from "@/components/tv/TurnControlsPanel";
import TurnShowcase from "@/components/tv/TurnShowcase";

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
  const [livePrompt, setLivePrompt] = useState<string | null>(null);
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

  const startEngine = useCallback(() => {
    if (!canAutoRun) return;
    setEngineActive(true);
    setEngineError(null);
  }, [canAutoRun]);

  const stopEngine = useCallback(() => {
    setEngineActive(false);
    setEngineStatus("idle");
    setCooldownRemaining(0);
    setStreamingNarration("");
    setStreamingImage(null);
    setLivePrompt(null);
    setEngineError(null);
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  useEffect(() => {
    if (!engineActive || !game?.id) return;

    let cancelled = false;

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const runTurnOnce = () =>
      new Promise<void>((resolve) => {
        const source = new EventSource(`/api/games/${game.id}/turns/stream`);
        sourceRef.current = source;
        setEngineStatus("running");
        setStreamingNarration("");
        setStreamingImage(null);
        setLivePrompt(null);

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

        source.addEventListener("image_prompt", (event) => {
          const payload = JSON.parse((event as MessageEvent<string>).data) as { prompt?: string };
          if (payload.prompt) {
            setLivePrompt(payload.prompt);
          }
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
          setLivePrompt(null);
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

  const latestTurn = turns[turns.length - 1];
  const displayNarration =
    streamingNarration ||
    latestTurn?.continuation ||
    (canAutoRun ? "Start the turn engine to conjure the next beat." : "Waiting for the adventure to begin.");
  const displayImage = streamingImage ?? latestTurn?.image ?? null;
  const displayPrompt = streamingNarration ? livePrompt ?? undefined : latestTurn?.imagePrompt;
  const narrationKey = streamingNarration ? "streaming" : latestTurn?.id ?? "idle";

  return (
    <Box
      p={{ initial: "4", sm: "6" }}
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #04030f, #100622)",
      }}
    >
      <Flex direction="column" gap="5">
        <Flex justify="between" align="center" wrap="wrap" gap="4">
          <Box>
            <Text color="gray" size="2">
              Game Code
            </Text>
            <Heading size="8">{typeof gameId === "string" ? gameId : "--"}</Heading>
          </Box>
          <Badge size="3" color="plum">
            {playerCount} {playerCount === 1 ? "Player" : "Players"}
          </Badge>
        </Flex>
        {error && (
          <Box
            style={{
              borderRadius: 16,
              border: "1px solid rgba(255,0,0,0.4)",
              padding: "1rem",
              background: "rgba(255,0,0,0.08)",
            }}
          >
            <Text color="red">{error}</Text>
          </Box>
        )}
        <Flex gap="5" align="start" wrap="wrap">
          <Box style={{ width: "320px", flexShrink: 0 }}>
            <PlayerListPanel
              players={game?.players ?? []}
              gameCode={typeof gameId === "string" ? gameId : undefined}
              joinUrl={joinUrl || undefined}
            />
          </Box>
          <Flex direction="column" gap="4" style={{ flex: 1, minWidth: 0 }}>
            <TurnControlsPanel
              engineStatus={engineStatus}
              engineActive={engineActive}
              cooldownRemaining={cooldownRemaining}
              canRun={!!canAutoRun && !loading}
              onStart={startEngine}
              onStop={stopEngine}
              engineError={engineError}
              turns={turns}
            />
            <TurnShowcase
              imageSrc={displayImage ?? undefined}
              narration={displayNarration}
              prompt={displayPrompt}
              variantKey={narrationKey}
            />
          </Flex>
        </Flex>
      </Flex>
    </Box>
  );
}

