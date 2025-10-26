import path from "path";
import { Liquid } from "liquidjs";
import type { GameState } from "@/types/game";

const engine = new Liquid({
  root: path.join(process.cwd(), "src", "templates"),
  extname: ".liquid",
});

export async function buildGameLoopSystemPrompt(game: GameState) {
  return engine.renderFile("game_loop_system", { game });
}
