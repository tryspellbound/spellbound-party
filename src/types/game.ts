export type Player = {
  id: string;
  name: string;
  joinedAt: number;
  avatar?: string;
};

export type GameTurn = {
  id: string;
  createdAt: number;
  continuation: string;
  imagePrompt?: string;
  image?: string;
};

export type GameState = {
  id: string;
  createdAt: number;
  status: "lobby" | "in-progress";
  players: Player[];
  turns: GameTurn[];
};
