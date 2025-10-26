import type { NextApiRequest, NextApiResponse } from "next";
import { createGame } from "@/lib/gameStore";

const getBaseUrl = (req: NextApiRequest) => {
  if (req.headers.origin) {
    return req.headers.origin;
  }
  const host = req.headers.host ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end("Method Not Allowed");
    return;
  }

  try {
    const game = await createGame();
    const baseUrl = getBaseUrl(req);
    res.status(201).json({
      game,
      joinUrl: `${baseUrl}/play/${game.id}`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create game" });
  }
}

