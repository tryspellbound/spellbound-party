import type { NextApiRequest, NextApiResponse } from "next";
import { addPlayerToGame } from "@/lib/gameStore";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end("Method Not Allowed");
    return;
  }

  const { gameId } = req.query;
  if (typeof gameId !== "string") {
    res.status(400).json({ error: "gameId is required" });
    return;
  }

  const { name, avatar } = req.body ?? {};

  try {
    const { game, player } = await addPlayerToGame(
      gameId,
      String(name ?? ""),
      typeof avatar === "string" ? avatar : undefined,
    );
    res.status(200).json({ game, player });
  } catch (error) {
    console.error(error);
    res
      .status(error instanceof Error && error.message === "Game not found" ? 404 : 400)
      .json({ error: error instanceof Error ? error.message : "Unable to add player" });
  }
}
