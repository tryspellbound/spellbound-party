import type { NextApiRequest, NextApiResponse } from "next";
import { getRedisClient } from "@/lib/redis";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end("Method Not Allowed");
    return;
  }
  if (process.env.NODE_ENV !== "development") {
    res.status(403).end("Forbidden");
    return;
  }

  try {
    const client = await getRedisClient();

    console.log("[RESET] Starting Redis cleanup...");

    // Get all keys with the game: prefix
    const gameKeys = await client.keys("game:*");
    console.log(`[RESET] Found ${gameKeys.length} game keys`);

    // Delete all game keys
    if (gameKeys.length > 0) {
      const deleted = await client.del(gameKeys);
      console.log(`[RESET] Deleted ${deleted} keys`);
    }

    res.status(200).json({
      success: true,
      message: `Successfully deleted ${gameKeys.length} Redis keys`,
      deletedCount: gameKeys.length,
    });
  } catch (error) {
    console.error("[RESET] Error clearing Redis:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to clear Redis",
    });
  }
}
