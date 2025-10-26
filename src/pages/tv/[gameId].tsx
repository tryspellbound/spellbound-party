import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Flex } from "@radix-ui/themes";
import type { GameState, GameTurn } from "@/types/game";
import PlayerListPanel from "@/components/tv/PlayerListPanel";
import TurnShowcase from "@/components/tv/TurnShowcase";
import AvatarSpeaker from "@/components/tv/AvatarSpeaker";

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
  const [audioPlaybackTime, setAudioPlaybackTime] = useState(0);
  const [audioAlignment, setAudioAlignment] = useState<{
    characters: string[];
    characterStartTimesSeconds: number[];
    characterEndTimesSeconds: number[];
  } | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const audioChunksQueue = useRef<Uint8Array[]>([]);
  const hasStartedPlayback = useRef(false);
  const playbackTimeUpdateInterval = useRef<number | null>(null);

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
    if (!canAutoRun) {
      console.log("[TV ENGINE] Cannot start - canAutoRun is false");
      return;
    }
    console.log("[TV ENGINE] Starting turn engine");
    setEngineActive(true);
    setEngineError(null);
  }, [canAutoRun]);

  const stopEngine = useCallback(() => {
    console.log("[TV ENGINE] Stopping turn engine");
    setEngineActive(false);
    setEngineStatus("idle");
    setCooldownRemaining(0);
    setStreamingNarration("");
    setStreamingImage(null);
    setLivePrompt(null);
    setEngineError(null);
    setAudioPlaybackTime(0);
    setAudioAlignment(null);
    sourceRef.current?.close();
    sourceRef.current = null;
    // Stop any playing audio and reset queue
    audioChunksQueue.current = [];
    hasStartedPlayback.current = false;
    if (playbackTimeUpdateInterval.current) {
      cancelAnimationFrame(playbackTimeUpdateInterval.current);
      playbackTimeUpdateInterval.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    if (mediaSourceRef.current) {
      if (mediaSourceRef.current.readyState === "open") {
        mediaSourceRef.current.endOfStream();
      }
      mediaSourceRef.current = null;
    }
    sourceBufferRef.current = null;
  }, []);

  useEffect(() => {
    if (!engineActive || !game?.id) {
      console.log(`[TV ENGINE] Effect skipped - engineActive: ${engineActive}, gameId: ${game?.id}`);
      return;
    }

    console.log(`[TV ENGINE] Effect running for game ${game.id}`);
    let cancelled = false;
    let turnCount = 0;

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const runTurnOnce = () =>
      new Promise<void>((resolve) => {
        turnCount++;
        const turnId = `turn-${turnCount}-${Date.now()}`;
        console.log(`[TV ENGINE ${turnId}] Creating EventSource for /api/games/${game.id}/turns/stream`);
        const connectionStart = Date.now();

        const source = new EventSource(`/api/games/${game.id}/turns/stream`);
        sourceRef.current = source;
        setEngineStatus("running");
        setStreamingNarration("");
        setStreamingImage(null);
        setLivePrompt(null);

        // Track audio playback completion
        let audioPlaybackComplete = false;
        let streamComplete = false;
        let audioPlaybackResolver: (() => void) | null = null;
        const audioPlaybackPromise = new Promise<void>((resolveAudio) => {
          audioPlaybackResolver = resolveAudio;
        });

        const checkComplete = () => {
          if (streamComplete && audioPlaybackComplete) {
            console.log(`[TV ENGINE ${turnId}] Both stream and audio playback complete, resolving turn`);
            clearTimeout(audioSafetyTimeout);
            resolve();
          } else if (streamComplete && !audioPlaybackComplete) {
            console.log(`[TV ENGINE ${turnId}] Stream complete, waiting for audio playback to finish...`);
          }
        };

        // Safety timeout: if audio doesn't end within 5 minutes, force completion
        const audioSafetyTimeout = setTimeout(() => {
          if (!audioPlaybackComplete && streamComplete) {
            console.warn(`[TV ENGINE ${turnId}] Audio playback timeout after 5 minutes, forcing completion`);
            audioPlaybackComplete = true;
            checkComplete();
          }
        }, 5 * 60 * 1000);

        // Clear audio queue and reset for new turn
        audioChunksQueue.current = [];
        hasStartedPlayback.current = false;
        setAudioPlaybackTime(0);
        setAudioAlignment(null);
        if (playbackTimeUpdateInterval.current) {
          cancelAnimationFrame(playbackTimeUpdateInterval.current);
          playbackTimeUpdateInterval.current = null;
        }
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = "";
        }
        if (mediaSourceRef.current) {
          if (mediaSourceRef.current.readyState === "open") {
            try {
              mediaSourceRef.current.endOfStream();
            } catch (e) {
              // Ignore errors when ending stream
            }
          }
          mediaSourceRef.current = null;
        }
        sourceBufferRef.current = null;

        source.addEventListener("open", () => {
          console.log(`[TV ENGINE ${turnId}] EventSource connection opened`);
        });

        source.addEventListener("ping", (event) => {
          const payload = JSON.parse((event as MessageEvent<string>).data) as { timestamp?: number };
          console.log(`[TV ENGINE ${turnId}] Ping received (server time: ${payload.timestamp})`);
        });

        const closeSource = () => {
          console.log(`[TV ENGINE ${turnId}] Closing EventSource (duration: ${Date.now() - connectionStart}ms)`);
          source.close();
          if (sourceRef.current === source) {
            sourceRef.current = null;
          }
        };

        source.addEventListener("continuation_complete", (event) => {
          const payload = JSON.parse((event as MessageEvent<string>).data) as { text?: string };
          console.log(`[TV ENGINE ${turnId}] Continuation complete received (${payload.text?.length ?? 0} chars)`);
          setStreamingNarration(payload.text ?? "");
        });

        source.addEventListener("image_prompt", (event) => {
          const payload = JSON.parse((event as MessageEvent<string>).data) as { prompt?: string };
          if (payload.prompt) {
            console.log(`[TV ENGINE ${turnId}] Image prompt received: ${payload.prompt.substring(0, 80)}...`);
            setLivePrompt(payload.prompt);
          }
        });

        source.addEventListener("image_partial", (event) => {
          const payload = JSON.parse((event as MessageEvent<string>).data) as { image?: string };
          if (payload.image) {
            console.log(`[TV ENGINE ${turnId}] Image partial received`);
            setStreamingImage(payload.image);
          }
        });

        source.addEventListener("image_complete", (event) => {
          const payload = JSON.parse((event as MessageEvent<string>).data) as { image?: string };
          if (payload.image) {
            console.log(`[TV ENGINE ${turnId}] Image complete received`);
            setStreamingImage(payload.image);
          }
        });

        // Initialize MediaSource for gapless audio streaming
        const initMediaSource = () => {
          if (!audioRef.current) {
            audioRef.current = new Audio();
          }

          const mediaSource = new MediaSource();
          mediaSourceRef.current = mediaSource;
          audioRef.current.src = URL.createObjectURL(mediaSource);

          mediaSource.addEventListener("sourceopen", () => {
            const mimeType = 'audio/mpeg';

            if (!MediaSource.isTypeSupported(mimeType)) {
              console.error("MediaSource type not supported:", mimeType);
              return;
            }

            try {
              const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
              sourceBufferRef.current = sourceBuffer;
              sourceBuffer.mode = 'sequence'; // Auto-generate timestamps

              // Pump queue when SourceBuffer is ready
              sourceBuffer.addEventListener("updateend", pumpAudioQueue);

              console.log("MediaSource initialized for gapless audio");
            } catch (err) {
              console.error("Failed to create SourceBuffer:", err);
            }
          });
        };

        const pumpAudioQueue = () => {
          const sourceBuffer = sourceBufferRef.current;
          if (!sourceBuffer || sourceBuffer.updating) return;
          if (audioChunksQueue.current.length === 0) return;

          const chunk = audioChunksQueue.current.shift();
          if (!chunk) return;

          try {
            sourceBuffer.appendBuffer(chunk.buffer as ArrayBuffer);

            // Start playback after first chunk is buffered
            if (!hasStartedPlayback.current && audioRef.current) {
              hasStartedPlayback.current = true;
              audioRef.current.play().catch((err) => {
                console.error("Audio autoplay blocked:", err);
              });

              // Start tracking playback time for text highlighting
              const updatePlaybackTime = () => {
                if (audioRef.current && !audioRef.current.paused) {
                  setAudioPlaybackTime(audioRef.current.currentTime);
                  playbackTimeUpdateInterval.current = requestAnimationFrame(updatePlaybackTime);
                }
              };
              playbackTimeUpdateInterval.current = requestAnimationFrame(updatePlaybackTime);
            }
          } catch (err) {
            console.error("Failed to append audio buffer:", err);
            // Handle QUOTA_EXCEEDED by removing old buffered data
            if (err instanceof Error && err.name === "QuotaExceededError" && audioRef.current) {
              try {
                const currentTime = audioRef.current.currentTime;
                if (currentTime > 30) {
                  sourceBuffer.remove(0, currentTime - 30);
                }
              } catch (removeErr) {
                console.error("Failed to remove old buffer:", removeErr);
              }
            }
          }
        };

        source.addEventListener("audio_chunk", (event) => {
          const payload = JSON.parse((event as MessageEvent<string>).data) as {
            chunk?: string;
            index?: number;
            alignment?: {
              characters: string[];
              characterStartTimesSeconds: number[];
              characterEndTimesSeconds: number[];
            };
            normalizedAlignment?: {
              characters: string[];
              characterStartTimesSeconds: number[];
              characterEndTimesSeconds: number[];
            };
          };
          if (!payload.chunk) return;

          console.log(`[TV ENGINE ${turnId}] Audio chunk received (index: ${payload.index})`);

          // Accumulate alignment data (prefer normalizedAlignment if available)
          const alignmentData = payload.normalizedAlignment || payload.alignment;
          if (alignmentData && alignmentData.characters.length > 0) {
            setAudioAlignment((prev) => {
              if (!prev) {
                return alignmentData;
              }
              // Append new alignment data to existing
              return {
                characters: [...prev.characters, ...alignmentData.characters],
                characterStartTimesSeconds: [
                  ...prev.characterStartTimesSeconds,
                  ...alignmentData.characterStartTimesSeconds,
                ],
                characterEndTimesSeconds: [
                  ...prev.characterEndTimesSeconds,
                  ...alignmentData.characterEndTimesSeconds,
                ],
              };
            });
          }

          // Initialize MediaSource on first chunk
          if (!mediaSourceRef.current) {
            console.log(`[TV ENGINE ${turnId}] Initializing MediaSource for audio`);
            initMediaSource();
          }

          // Convert base64 to Uint8Array and queue
          try {
            const binaryString = atob(payload.chunk);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            audioChunksQueue.current.push(bytes);

            // Try to pump queue
            pumpAudioQueue();
          } catch (err) {
            console.error(`[TV ENGINE ${turnId}] Failed to decode audio chunk:`, err);
          }
        });

        source.addEventListener("audio_complete", () => {
          console.log(`[TV ENGINE ${turnId}] Audio streaming complete`);

          // End the stream once all chunks are appended
          const tryEndStream = () => {
            const mediaSource = mediaSourceRef.current;
            const sourceBuffer = sourceBufferRef.current;

            if (!mediaSource || !sourceBuffer) return;

            if (sourceBuffer.updating) {
              setTimeout(tryEndStream, 50);
            } else if (audioChunksQueue.current.length === 0 && mediaSource.readyState === "open") {
              try {
                mediaSource.endOfStream();
                console.log(`[TV ENGINE ${turnId}] MediaSource stream ended, waiting for playback to finish`);

                // Set up listener for when audio playback actually finishes
                if (audioRef.current) {
                  const audio = audioRef.current;

                  const onAudioEnded = () => {
                    console.log(`[TV ENGINE ${turnId}] Audio playback finished`);
                    audioPlaybackComplete = true;
                    audio.removeEventListener('ended', onAudioEnded);
                    audio.removeEventListener('pause', onAudioEnded);
                    checkComplete();
                  };

                  // Listen for both 'ended' (natural completion) and 'pause' (if stopped early)
                  audio.addEventListener('ended', onAudioEnded);

                  // If audio is already paused/ended, mark as complete immediately
                  if (audio.paused && audio.currentTime === 0) {
                    console.log(`[TV ENGINE ${turnId}] Audio already stopped, marking as complete`);
                    audioPlaybackComplete = true;
                    checkComplete();
                  } else if (audio.ended) {
                    console.log(`[TV ENGINE ${turnId}] Audio already ended, marking as complete`);
                    onAudioEnded();
                  }
                } else {
                  console.log(`[TV ENGINE ${turnId}] No audio element, marking playback as complete`);
                  audioPlaybackComplete = true;
                  checkComplete();
                }
              } catch (err) {
                console.error(`[TV ENGINE ${turnId}] Failed to end stream:`, err);
                // Still mark as complete even if there was an error
                audioPlaybackComplete = true;
                checkComplete();
              }
            }
          };

          tryEndStream();
        });

        source.addEventListener("audio_error", (event) => {
          const payload = JSON.parse((event as MessageEvent<string>).data) as { message?: string };
          console.error(`[TV ENGINE ${turnId}] Audio error:`, payload.message);
          // If audio generation failed, mark playback as complete so we don't wait forever
          audioPlaybackComplete = true;
          checkComplete();
        });

        source.addEventListener("turn_complete", (event) => {
          const payload = JSON.parse((event as MessageEvent<string>).data) as { turn: GameTurn };
          console.log(`[TV ENGINE ${turnId}] Turn complete received - ID: ${payload.turn.id}`);
          setTurns((prev) => {
            if (prev.some((t) => t.id === payload.turn.id)) {
              console.log(`[TV ENGINE ${turnId}] Turn ${payload.turn.id} already exists in state, skipping`);
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
          console.error(`[TV ENGINE ${turnId}] Turn error received: ${payload.message}`);
          setEngineError(payload.message ?? "Turn generation failed");
          closeSource();
          clearTimeout(audioSafetyTimeout);
          // On error, mark both as complete and resolve immediately
          streamComplete = true;
          audioPlaybackComplete = true;
          resolve();
        });

        source.addEventListener("done", () => {
          console.log(`[TV ENGINE ${turnId}] Done event received`);
          closeSource();
          streamComplete = true;

          // If there was no audio generated, mark audio as complete
          if (!audioRef.current || !mediaSourceRef.current) {
            console.log(`[TV ENGINE ${turnId}] No audio was generated, marking as complete`);
            audioPlaybackComplete = true;
          }

          checkComplete();
        });

        source.onerror = (errorEvent) => {
          console.error(`[TV ENGINE ${turnId}] EventSource error occurred:`, errorEvent);
          console.error(`[TV ENGINE ${turnId}] EventSource readyState: ${source.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSED)`);
          console.error(`[TV ENGINE ${turnId}] Connection duration: ${Date.now() - connectionStart}ms`);
          setEngineError("Turn stream disconnected");
          closeSource();
          clearTimeout(audioSafetyTimeout);
          // On error, mark both as complete and resolve immediately
          streamComplete = true;
          audioPlaybackComplete = true;
          resolve();
        };
      });

    const loop = async () => {
      console.log("[TV ENGINE] Loop started");
      while (!cancelled) {
        console.log(`[TV ENGINE] Starting turn ${turnCount + 1}`);
        await runTurnOnce();
        console.log(`[TV ENGINE] Turn ${turnCount} completed`);

        if (cancelled) {
          console.log("[TV ENGINE] Loop cancelled during turn");
          break;
        }

        console.log(`[TV ENGINE] Starting ${COOLDOWN_SECONDS}s cooldown`);
        setEngineStatus("cooldown");
        for (let i = COOLDOWN_SECONDS; i > 0; i -= 1) {
          if (cancelled) {
            console.log("[TV ENGINE] Loop cancelled during cooldown");
            break;
          }
          setCooldownRemaining(i);
          // eslint-disable-next-line no-await-in-loop
          await wait(1000);
        }
        setCooldownRemaining(0);

        if (!canAutoRun) {
          console.log("[TV ENGINE] Loop stopping - canAutoRun is false");
          break;
        }

        console.log("[TV ENGINE] Cooldown complete, starting next turn");
      }

      if (!cancelled) {
        console.log("[TV ENGINE] Loop ended naturally");
        setEngineStatus("idle");
        setEngineActive(false);
      } else {
        console.log("[TV ENGINE] Loop ended due to cancellation");
      }
    };

    loop().catch((err) => {
      console.error("[TV ENGINE] Loop error:", err);
      setEngineError("Turn engine failed");
      setEngineStatus("idle");
      setEngineActive(false);
    });

    return () => {
      console.log("[TV ENGINE] Effect cleanup - cancelling loop");
      cancelled = true;
      sourceRef.current?.close();
    };
  }, [engineActive, canAutoRun, game?.id]);

  useEffect(
    () => () => {
      sourceRef.current?.close();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      if (mediaSourceRef.current) {
        if (mediaSourceRef.current.readyState === "open") {
          try {
            mediaSourceRef.current.endOfStream();
          } catch (e) {
            // Ignore cleanup errors
          }
        }
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
          audioPlaybackTime={audioPlaybackTime}
          audioAlignment={audioAlignment}
        />

        {/* Avatar speaker in bottom right */}
        <AvatarSpeaker audioElement={audioRef.current} />
      </Box>
    </Flex>
  );
}

