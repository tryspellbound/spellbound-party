export type Player = {
  id: string;
  name: string;
  joinedAt: number;
  avatar?: string;
};

export type RequestType = "multiple_choice" | "free_text" | "yes_no" | "dice_roll";

export type BaseRequest = {
  id: string;
  type: RequestType;
  question: string;
  targetPlayers?: string[];
};

export type MultipleChoiceRequest = BaseRequest & {
  type: "multiple_choice";
  choices: string[];
  targetPlayers?: never;
};

export type FreeTextRequest = BaseRequest & {
  type: "free_text";
  targetPlayers: [string];
};

export type YesNoRequest = BaseRequest & {
  type: "yes_no";
  targetPlayers: [string];
};

export type DiceRollRequest = BaseRequest & {
  type: "dice_roll";
  diceCount: number;
  targetPlayers: [string];
};

export type Request = MultipleChoiceRequest | FreeTextRequest | YesNoRequest | DiceRollRequest;

export type RequestResponse = {
  playerId: string;
  response: string | null;
  timestamp: number;
};

export type GameTurn = {
  id: string;
  createdAt: number;
  continuation: string;
  imagePrompt?: string;
  image?: string;
  requests?: Request[];
  responses?: Record<string, RequestResponse[]>;
};

export type GameState = {
  id: string;
  createdAt: number;
  status: "lobby" | "in-progress";
  players: Player[];
  turns: GameTurn[];
};
