import type { NextApiRequest, NextApiResponse } from "next";
import { getActiveRequestsForPlayer, getMultipleChoiceVoteCounts } from "@/lib/requestStore";
import { getGame } from "@/lib/gameStore";
import type { MultipleChoiceRequest } from "@/types/game";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end("Method Not Allowed");
    return;
  }

  const { gameId } = req.query;
  const { playerId, turnNumber } = req.query;

  if (typeof gameId !== "string") {
    res.status(400).json({ error: "gameId is required" });
    return;
  }

  if (typeof playerId !== "string") {
    res.status(400).json({ error: "playerId query parameter is required" });
    return;
  }

  if (typeof turnNumber !== "string") {
    res.status(400).json({ error: "turnNumber query parameter is required" });
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

    // Get active requests for this player
    const requests = await getActiveRequestsForPlayer(gameId, Number(turnNumber), playerId);

    // For multiple choice requests, include vote counts
    const requestsWithCounts = await Promise.all(
      requests.map(async (request) => {
        if (request.type === "multiple_choice") {
          const mcRequest = request as MultipleChoiceRequest;
          const voteCounts = await getMultipleChoiceVoteCounts(
            gameId,
            Number(turnNumber),
            request.id,
            mcRequest.choices
          );
          return {
            ...request,
            voteCounts,
          };
        }
        return request;
      })
    );

    res.status(200).json({ requests: requestsWithCounts });
  } catch (error) {
    console.error("Error fetching active requests:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unable to fetch active requests",
    });
  }
}
