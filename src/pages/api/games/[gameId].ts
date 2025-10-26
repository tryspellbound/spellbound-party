import type { NextApiRequest, NextApiResponse } from "next";
import { getGame } from "@/lib/gameStore";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end("Method Not Allowed");
    return;
  }

  const { gameId } = req.query;
  if (typeof gameId !== "string") {
    res.status(400).json({ error: "gameId is required" });
    return;
  }

  try {
    const game = await getGame(gameId);
    if (!game) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    res.status(200).json({ game });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch game" });
  }
}

