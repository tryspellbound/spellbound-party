import type { NextApiRequest, NextApiResponse } from "next";
import { startGame } from "@/lib/gameStore";

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

  try {
    const game = await startGame(gameId);
    res.status(200).json({ game });
  } catch (error) {
    console.error(error);
    res.status(404).json({ error: error instanceof Error ? error.message : "Unable to start" });
  }
}

