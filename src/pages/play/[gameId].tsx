import { useRouter } from "next/router";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, Badge, Box, Button, Card, Flex, Heading, Tabs, Text, TextField } from "@radix-ui/themes";
import type { GameState, Player } from "@/types/game";

const POLL_INTERVAL = 2000;
const MAX_AVATAR_BYTES = 300 * 1024;

export default function PlayerJoinPage() {
  const router = useRouter();
  const { gameId } = router.query;
  const ready = router.isReady && typeof gameId === "string";

  const [game, setGame] = useState<GameState | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState("");
  const [tab, setTab] = useState<"players" | "inputs">("players");
  const [joined, setJoined] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  const fetchGame = useCallback(async () => {
    if (!ready || typeof gameId !== "string") return;
    try {
      const res = await fetch(`/api/games/${gameId}`);
      if (!res.ok) {
        throw new Error("Unable to load game");
      }
      const data = (await res.json()) as { game: GameState };
      setGame(data.game);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to load game");
    }
  }, [gameId, ready]);

  useEffect(() => {
    fetchGame();
  }, [fetchGame]);

  useEffect(() => {
    if (!ready || typeof gameId !== "string") return;
    const interval = setInterval(fetchGame, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchGame, ready, gameId]);

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("Avatar must be under 300KB");
      input.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (result) {
        setAvatarDataUrl(result);
        setAvatarError(null);
      } else {
        setAvatarError("Unable to read image");
      }
      input.value = "";
    };
    reader.onerror = () => {
      setAvatarError("Unable to read image");
      input.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarClear = () => {
    setAvatarDataUrl("");
    setAvatarError(null);
  };

  const handleJoin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = playerName.trim();
    if (!trimmed || !gameId || typeof gameId !== "string") return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/games/${gameId}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, avatar: avatarDataUrl || undefined }),
      });

      const data = (await res.json()) as { error?: string; game?: GameState; player?: Player };
      if (!res.ok || !data.game || !data.player) {
        throw new Error(data.error ?? "Unable to join");
      }
      setPlayerName(trimmed);
      setGame(data.game);
      setPlayerId(data.player.id);
      setAvatarDataUrl(data.player.avatar ?? avatarDataUrl);
      setJoined(true);
      setTab("players");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to join");
    } finally {
      setSubmitting(false);
    }
  };

  const hasGame = Boolean(game);
  const currentPlayer = useMemo(() => {
    if (!playerId || !game) {
      return null;
    }
    return game.players.find((p) => p.id === playerId) ?? null;
  }, [game, playerId]);
  const playerPreviewAvatar = currentPlayer?.avatar ?? avatarDataUrl;

  return (
    <Box
      p={{ initial: "4", sm: "6" }}
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, rgba(47,38,132,0.8), rgba(4,3,22,0.95)) center / cover no-repeat, #050115",
      }}
    >
      <Flex direction="column" gap="5">
        <Flex justify="between" align="center" wrap="wrap" gap="3">
          <Box>
            <Text size="2" color="gray">
              Joining Game
            </Text>
            <Heading size="8">{typeof gameId === "string" ? gameId : "--"}</Heading>
          </Box>
          <Badge size="3" color={joined ? "lime" : "gray"}>
            {joined ? "You're in!" : "Waiting to join"}
          </Badge>
        </Flex>

        {!joined ? (
          <Card variant="surface" size="3">
            <form onSubmit={handleJoin}>
              <Flex direction="column" gap="3">
                <Text size="4" weight="bold">
                  Choose a player name
                </Text>
                <TextField.Root
                  size="3"
                  placeholder="SpookySam"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                />
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleAvatarChange}
                />
                <Flex direction="column" gap="2">
                  <Flex align="center" gap="3" wrap="wrap">
                    <Avatar
                      size="4"
                      radius="full"
                      src={playerPreviewAvatar}
                      fallback={(playerName[0] ?? "?").toUpperCase()}
                    />
                    <Button variant="soft" type="button" asChild>
                      <label htmlFor="avatar-upload" style={{ cursor: "pointer" }}>
                        Upload avatar
                      </label>
                    </Button>
                    {avatarDataUrl && (
                      <Button variant="ghost" type="button" onClick={handleAvatarClear}>
                        Remove
                      </Button>
                    )}
                  </Flex>
                  <Text size="2" color="gray">
                    Recommended under 300KB. JPG, PNG, or GIF.
                  </Text>
                  {avatarError && (
                    <Text size="2" color="red">
                      {avatarError}
                    </Text>
                  )}
                </Flex>
                <Button type="submit" size="3" disabled={!playerName.trim()} loading={submitting}>
                  Join Game
                </Button>
                {error && (
                  <Text color="red" size="2">
                    {error}
                  </Text>
                )}
              </Flex>
            </form>
          </Card>
        ) : (
          <Card variant="surface">
            <Flex justify="between" align="center" gap="3">
              <Flex align="center" gap="3">
                <Avatar
                  size="4"
                  radius="full"
                  src={playerPreviewAvatar}
                  fallback={((currentPlayer?.name ?? playerName)[0] ?? "?").toUpperCase()}
                />
                <Box>
                  <Text>Welcome, {currentPlayer?.name ?? playerName}</Text> 
                  <br/>
                  <Text size="2" color="gray">
                    Ready up—your controls will unlock soon.
                  </Text>
                </Box>
              </Flex>
              <Badge color="iris" radius="full">
                Connected
              </Badge>
            </Flex>
          </Card>
        )}

        {hasGame && (
          <Card variant="classic">
            <Tabs.Root value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
              <Tabs.List>
                <Tabs.Trigger value="players">Players</Tabs.Trigger>
                <Tabs.Trigger value="inputs" disabled={!joined}>
                  Your Inputs
                </Tabs.Trigger>
              </Tabs.List>
              <Tabs.Content value="players" style={{ marginTop: "1.5rem" }}>
                <Flex direction="column" gap="2">
                  {game?.players.length ? (
                    game.players.map((player) => (
                      <Card key={player.id} variant="surface">
                        <Flex align="center" gap="3">
                          <Avatar
                            size="3"
                            radius="full"
                            src={player.avatar}
                            fallback={(player.name[0] ?? "?").toUpperCase()}
                          />
                          <Text weight="bold">{player.name}</Text>
                        </Flex>
                      </Card>
                    ))
                  ) : (
                    <Text color="gray">Waiting for the first brave soul…</Text>
                  )}
                </Flex>
              </Tabs.Content>
              <Tabs.Content value="inputs" style={{ marginTop: "1.5rem" }}>
                {joined ? (
                  <Flex
                    align="center"
                    justify="center"
                    style={{ minHeight: 160, borderRadius: 12, background: "rgba(255,255,255,0.02)" }}
                  >
                    <Text color="gray">Your spell prompts will appear here once the game starts.</Text>
                  </Flex>
                ) : (
                  <Text color="gray">Join the game to see your controls.</Text>
                )}
              </Tabs.Content>
            </Tabs.Root>
          </Card>
        )}
      </Flex>
    </Box>
  );
}
