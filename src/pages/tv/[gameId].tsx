import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Flex } from "@radix-ui/themes";
import type { GameState, GameTurn } from "@/types/game";
import PlayerListPanel from "@/components/tv/PlayerListPanel";
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioChunksQueue = useRef<string[]>([]);
  const currentAudioIndex = useRef(0);

  const playerCount = game?.players.length ?? 0;
  const canAutoRun = game?.status === "in-progress" && playerCount > 0;

  // Suppress error to avoid unused warning
  void error;

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
    // Stop any playing audio and reset queue
    audioChunksQueue.current = [];
    currentAudioIndex.current = 0;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
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
        // Clear audio queue and stop previous audio
        audioChunksQueue.current = [];
        currentAudioIndex.current = 0;
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }

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

        source.addEventListener("audio_chunk", (event) => {
          const payload = JSON.parse((event as MessageEvent<string>).data) as { chunk?: string; index?: number };
          console.log("Received audio chunk:", payload.index, "chunk length:", payload.chunk?.length);
          if (payload.chunk) {
            // Add chunk to queue
            audioChunksQueue.current.push(payload.chunk);
            console.log("Audio queue length:", audioChunksQueue.current.length);

            // Start playback if this is the first chunk
            if (audioChunksQueue.current.length === 1 && currentAudioIndex.current === 0) {
              console.log("Starting audio playback with first chunk");
              playNextAudioChunk();
            }
          }
        });

        const playNextAudioChunk = () => {
          console.log("playNextAudioChunk called, index:", currentAudioIndex.current, "queue length:", audioChunksQueue.current.length);

          if (currentAudioIndex.current >= audioChunksQueue.current.length) {
            console.log("No more chunks to play");
            return;
          }

          const chunk = audioChunksQueue.current[currentAudioIndex.current];
          if (!chunk) {
            console.log("Chunk is empty");
            return;
          }

          console.log("Playing chunk", currentAudioIndex.current, "size:", chunk.length);

          if (!audioRef.current) {
            console.log("Creating new Audio element");
            audioRef.current = new Audio();
            audioRef.current.addEventListener("ended", () => {
              console.log("Audio chunk ended, playing next");
              currentAudioIndex.current++;
              playNextAudioChunk();
            });
          }

          try {
            // Convert base64 chunk to audio URL
            const audioBlob = new Blob(
              [Uint8Array.from(atob(chunk), (c) => c.charCodeAt(0))],
              { type: "audio/mpeg" }
            );
            const audioUrl = URL.createObjectURL(audioBlob);
            console.log("Created blob URL:", audioUrl);

            audioRef.current.src = audioUrl;
            audioRef.current.play().then(() => {
              console.log("Audio playback started successfully");
            }).catch((err) => {
              console.error("Audio playback failed:", err);
              // Try next chunk on error
              currentAudioIndex.current++;
              playNextAudioChunk();
            });
          } catch (err) {
            console.error("Error creating audio blob:", err);
            currentAudioIndex.current++;
            playNextAudioChunk();
          }
        };

        source.addEventListener("audio_complete", () => {
          // Audio streaming is complete, all chunks should be queued
        });

        source.addEventListener("audio_error", (event) => {
          const payload = JSON.parse((event as MessageEvent<string>).data) as { message?: string };
          console.error("Audio error:", payload.message);
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
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
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
    <Flex
      style={{
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        backgroundColor: "var(--black-a12)",
      }}
    >
      {/* Left sidebar with players and controls */}
      <Box
        style={{
          width: "280px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--gray-1)",
          borderRight: "1px solid var(--gray-6)",
        }}
      >
        <PlayerListPanel
          players={game?.players ?? []}
          engineStatus={engineStatus}
          engineActive={engineActive}
          cooldownRemaining={cooldownRemaining}
          canRun={!!canAutoRun && !loading}
          onStart={startEngine}
          onStop={stopEngine}
          engineError={engineError}
        />
      </Box>

      {/* Main content area - full screen showcase */}
      <Box style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <TurnShowcase
          imageSrc={displayImage ?? undefined}
          narration={displayNarration}
          prompt={displayPrompt}
          variantKey={narrationKey}
        />
      </Box>
    </Flex>
  );
}

