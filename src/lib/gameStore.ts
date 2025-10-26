import { randomUUID } from "crypto";
import { Buffer } from "node:buffer";
import { getRedisClient } from "./redis";
import type { GameState, GameTurn, Player } from "@/types/game";

const GAME_KEY_PREFIX = "game:";
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const buildKey = (id: string) => `${GAME_KEY_PREFIX}${id}`;
const MAX_AVATAR_BYTES = 300 * 1024;

type StoredGame = Partial<GameState> & {
  id: string;
  createdAt: number;
  status: GameState["status"];
};

const normalizeGame = (game: StoredGame): GameState => ({
  ...game,
  players: game.players ?? [],
  turns: game.turns ?? [],
});

export const generateGameCode = (length = 4) => {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    const idx = Math.floor(Math.random() * CODE_ALPHABET.length);
    code += CODE_ALPHABET[idx];
  }
  return code;
};

async function persistGame(game: GameState) {
  const client = await getRedisClient();
  await client.set(buildKey(game.id), JSON.stringify(normalizeGame(game)));
}

const sanitizeAvatar = (avatar?: string) => {
  if (!avatar) {
    return undefined;
  }
  const trimmed = avatar.trim();
  if (!trimmed) {
    return undefined;
  }
  if (!trimmed.startsWith("data:image/")) {
    throw new Error("Avatar must be an image");
  }
  const base64Part = trimmed.split(",")[1];
  if (!base64Part) {
    throw new Error("Invalid avatar data");
  }
  const byteSize = Buffer.byteLength(base64Part, "base64");
  if (byteSize > MAX_AVATAR_BYTES) {
    throw new Error("Avatar is too large");
  }
  return trimmed;
};

export async function getGame(gameId: string): Promise<GameState | null> {
  if (!gameId) {
    return null;
  }

  const client = await getRedisClient();
  const data = await client.get(buildKey(gameId.toUpperCase()));
  return data ? normalizeGame(JSON.parse(data) as StoredGame) : null;
}

export async function createGame(): Promise<GameState> {
  const client = await getRedisClient();
  let attempts = 0;
  let gameId = generateGameCode();
  while (attempts < 10) {
    const exists = await client.exists(buildKey(gameId));
    if (!exists) {
      break;
    }
    gameId = generateGameCode();
    attempts += 1;
  }

  const game: GameState = {
    id: gameId,
    createdAt: Date.now(),
    status: "lobby",
    players: [],
    turns: [],
  };

  await persistGame(game);
  return game;
}

export async function appendTurnToGame(
  gameId: string,
  payload: Pick<GameTurn, "continuation"> & Partial<Pick<GameTurn, "imagePrompt" | "image">>,
): Promise<GameTurn> {
  const game = await getGame(gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  const turn: GameTurn = {
    id: randomUUID(),
    createdAt: Date.now(),
    continuation: payload.continuation,
    imagePrompt: payload.imagePrompt,
    image: payload.image,
  };

  game.turns = [...game.turns, turn];
  await persistGame(game);
  return turn;
}

export async function addPlayerToGame(
  gameId: string,
  playerName: string,
  playerAvatar?: string,
): Promise<{ game: GameState; player: Player }> {
  const trimmedName = playerName?.trim();
  if (!trimmedName) {
    throw new Error("Player name is required");
  }

  const sanitizedAvatar = sanitizeAvatar(playerAvatar);

  const game = await getGame(gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  const player: Player = {
    id: randomUUID(),
    name: trimmedName.slice(0, 24),
    joinedAt: Date.now(),
    avatar: sanitizedAvatar,
  };

  game.players = [...game.players, player];
  await persistGame(game);
  return { game, player };
}

export async function startGame(gameId: string) {
  const game = await getGame(gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  game.status = "in-progress";
  await persistGame(game);
  return game;
}
