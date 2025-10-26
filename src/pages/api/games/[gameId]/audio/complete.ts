import type { NextApiRequest, NextApiResponse } from "next";
import { signalAudioPlaybackComplete } from "@/lib/requestStore";
import { getGame } from "@/lib/gameStore";

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

  const { turnNumber } = req.body ?? {};

  if (turnNumber === undefined) {
    res.status(400).json({ error: "turnNumber is required" });
    return;
  }

  try {
    // Verify game exists
    const game = await getGame(gameId);
    if (!game) {
      res.status(404).json({ error: "Game not found" });
      return;
    }

    // Signal audio playback complete
    await signalAudioPlaybackComplete(gameId, Number(turnNumber));

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error signaling audio completion:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unable to signal audio completion",
    });
  }
}
