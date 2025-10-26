import type { NextApiRequest, NextApiResponse } from "next";
import { submitRequestResponse } from "@/lib/requestStore";
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

  const { requestId, playerId, response, turnNumber } = req.body ?? {};

  if (!requestId || !playerId || response === undefined || turnNumber === undefined) {
    res.status(400).json({
      error: "requestId, playerId, response, and turnNumber are required",
    });
    return;
  }

  try {
    // Verify game exists
    const game = await getGame(gameId);
    if (!game) {
      res.status(404).json({ error: "Game not found" });
      return;
    }

    // Verify player is part of the game
    const player = game.players.find((p) => p.id === playerId);
    if (!player) {
      res.status(403).json({ error: "Player not found in game" });
      return;
    }

    // Submit the response
    await submitRequestResponse(
      gameId,
      Number(turnNumber),
      String(requestId),
      String(playerId),
      String(response)
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error submitting request response:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unable to submit response",
    });
  }
}
