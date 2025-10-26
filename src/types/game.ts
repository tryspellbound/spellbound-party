export type Player = {
  id: string;
  name: string;
  joinedAt: number;
  avatar?: string;
};

export type GameState = {
  id: string;
  createdAt: number;
  status: "lobby" | "in-progress";
  players: Player[];
};
