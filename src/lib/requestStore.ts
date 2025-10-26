import { getRedisClient } from "./redis";
import type { Request, RequestResponse } from "@/types/game";

const REQUEST_TTL_SECONDS = 600; // 10 minutes TTL for request keys

/**
 * Build Redis key for a request's responses
 */
const buildRequestKey = (
  gameId: string,
  turnNumber: number,
  requestId: string
) => `request:${gameId}:${turnNumber}:${requestId}:responses`;

/**
 * Build Redis key for tracking active requests in a game
 */
const buildActiveRequestsKey = (gameId: string, turnNumber: number) =>
  `request:${gameId}:${turnNumber}:active`;

/**
 * Create Redis keys for each request and store request metadata
 */
export async function createRequestKeys(
  gameId: string,
  turnNumber: number,
  requests: Request[]
): Promise<void> {
  const client = await getRedisClient();

  // Store metadata for active requests
  const activeKey = buildActiveRequestsKey(gameId, turnNumber);
  for (const request of requests) {
    const requestKey = buildRequestKey(gameId, turnNumber, request.id);

    // Initialize empty hash for responses
    await client.HSET(requestKey, "__meta__", JSON.stringify(request));
    await client.expire(requestKey, REQUEST_TTL_SECONDS);

    // Add to active requests set with metadata
    await client.HSET(activeKey, request.id, JSON.stringify(request));
  }

  await client.expire(activeKey, REQUEST_TTL_SECONDS);
}

/**
 * Submit a player's response to a request
 */
export async function submitRequestResponse(
  gameId: string,
  turnNumber: number,
  requestId: string,
  playerId: string,
  response: string
): Promise<void> {
  const client = await getRedisClient();
  const requestKey = buildRequestKey(gameId, turnNumber, requestId);

  const requestResponse: RequestResponse = {
    playerId,
    response,
    timestamp: Date.now(),
  };

  await client.HSET(requestKey, playerId, JSON.stringify(requestResponse));
}

/**
 * Get current responses for a request
 */
export async function getRequestResponses(
  gameId: string,
  turnNumber: number,
  requestId: string
): Promise<RequestResponse[]> {
  const client = await getRedisClient();
  const requestKey = buildRequestKey(gameId, turnNumber, requestId);

  const hash = await client.HGETALL(requestKey);
  const responses: RequestResponse[] = [];

  for (const [key, value] of Object.entries(hash)) {
    if (key === "__meta__") continue; // Skip metadata
    responses.push(JSON.parse(value) as RequestResponse);
  }

  return responses;
}

/**
 * Wait for all responses to a request (no timeout - waits indefinitely)
 * Returns collected responses when all players have responded
 */
async function waitForRequestResponse(
  gameId: string,
  turnNumber: number,
  request: Request,
  expectedPlayerIds: string[],
  onResponse?: (response: RequestResponse) => void
): Promise<RequestResponse[]> {
  const client = await getRedisClient();
  const requestKey = buildRequestKey(gameId, turnNumber, request.id);

  const responses = new Map<string, RequestResponse>();

  while (true) {
    // Check for new responses
    const hash = await client.HGETALL(requestKey);

    for (const [playerId, value] of Object.entries(hash)) {
      if (playerId === "__meta__") continue;

      if (!responses.has(playerId)) {
        const response = JSON.parse(value) as RequestResponse;
        responses.set(playerId, response);
        onResponse?.(response);
      }
    }

    // Check if we have all expected responses
    const allResponded = expectedPlayerIds.every((id) => responses.has(id));
    if (allResponded) {
      console.log(
        `[REQUEST ${request.id}] All ${expectedPlayerIds.length} responses collected`
      );
      return Array.from(responses.values());
    }

    // Wait a bit before checking again
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/**
 * Wait for responses to all requests
 * Returns a map of requestId -> responses
 */
export async function waitForAllRequestResponses(
  gameId: string,
  turnNumber: number,
  requests: Request[],
  allPlayerIds: string[],
  onResponse?: (requestId: string, response: RequestResponse) => void
): Promise<Record<string, RequestResponse[]>> {
  console.log(
    `[REQUESTS] Waiting for ${requests.length} request(s) to be answered`
  );

  const results = await Promise.all(
    requests.map(async (request) => {
      // Determine expected player IDs for this request
      let expectedPlayerIds: string[];

      if (request.type === "multiple_choice") {
        // All players should respond
        expectedPlayerIds = allPlayerIds;
      } else {
        // Targeted request - only specific player(s)
        expectedPlayerIds = request.targetPlayers || [];
      }

      console.log(
        `[REQUEST ${request.id}] Type: ${request.type}, Expecting ${expectedPlayerIds.length} response(s)`
      );

      const responses = await waitForRequestResponse(
        gameId,
        turnNumber,
        request,
        expectedPlayerIds,
        (response) => onResponse?.(request.id, response)
      );

      return { requestId: request.id, responses };
    })
  );

  // Convert to record
  const responseMap: Record<string, RequestResponse[]> = {};
  for (const { requestId, responses } of results) {
    responseMap[requestId] = responses;
  }

  console.log(`[REQUESTS] All requests completed or timed out`);
  return responseMap;
}

/**
 * Get active requests for a specific player
 */
export async function getActiveRequestsForPlayer(
  gameId: string,
  turnNumber: number,
  playerId: string
): Promise<Request[]> {
  const client = await getRedisClient();
  const activeKey = buildActiveRequestsKey(gameId, turnNumber);

  const hash = await client.HGETALL(activeKey);
  const activeRequests: Request[] = [];

  for (const [requestId, value] of Object.entries(hash)) {
    const request = JSON.parse(value) as Request;

    // Check if this request targets the player
    if (request.type === "multiple_choice") {
      // Multiple choice targets all players
      // Check if player has already responded
      const responses = await getRequestResponses(
        gameId,
        turnNumber,
        requestId
      );
      const hasResponded = responses.some((r) => r.playerId === playerId);
      if (!hasResponded) {
        activeRequests.push(request);
      }
    } else if (request.targetPlayers?.includes(playerId)) {
      // Check if player has already responded
      const responses = await getRequestResponses(
        gameId,
        turnNumber,
        requestId
      );
      const hasResponded = responses.some((r) => r.playerId === playerId);
      if (!hasResponded) {
        activeRequests.push(request);
      }
    }
  }

  return activeRequests;
}

/**
 * Get vote counts for a multiple choice request
 */
export async function getMultipleChoiceVoteCounts(
  gameId: string,
  turnNumber: number,
  requestId: string,
  choices: string[]
): Promise<Record<string, number>> {
  const responses = await getRequestResponses(gameId, turnNumber, requestId);

  const counts: Record<string, number> = {};
  for (const choice of choices) {
    counts[choice] = 0;
  }

  for (const response of responses) {
    if (response.response !== null && counts[response.response] !== undefined) {
      counts[response.response]++;
    }
  }

  return counts;
}

/**
 * Clean up request keys after they're no longer needed
 */
export async function cleanupRequestKeys(
  gameId: string,
  turnNumber: number
): Promise<void> {
  const client = await getRedisClient();
  const activeKey = buildActiveRequestsKey(gameId, turnNumber);

  // Get all request IDs
  const hash = await client.HGETALL(activeKey);
  const requestIds = Object.keys(hash);

  // Delete all request keys
  for (const requestId of requestIds) {
    const requestKey = buildRequestKey(gameId, turnNumber, requestId);
    await client.DEL(requestKey);
  }
  await client.DEL(activeKey);
}

/**
 * Audio playback coordination
 */

const AUDIO_PLAYBACK_TIMEOUT_MS = 300000; // 5 minutes max wait for audio playback
const buildAudioPlaybackKey = (gameId: string, turnNumber: number) =>
  `audio:playback:${gameId}:${turnNumber}:complete`;

/**
 * Wait for frontend to signal that audio playback is complete
 * Returns true if playback completed, false if timeout
 */
export async function waitForAudioPlayback(
  gameId: string,
  turnNumber: number
): Promise<boolean> {
  const client = await getRedisClient();
  const key = buildAudioPlaybackKey(gameId, turnNumber);
  const startTime = Date.now();

  console.log(`[AUDIO] Waiting for audio playback completion for turn ${turnNumber}`);

  while (Date.now() - startTime < AUDIO_PLAYBACK_TIMEOUT_MS) {
    const value = await client.GET(key);
    if (value === "true") {
      console.log(`[AUDIO] Audio playback completed for turn ${turnNumber}`);
      // Clean up the key
      await client.DEL(key);
      return true;
    }

    // Wait a bit before checking again
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(`[AUDIO] Audio playback timeout for turn ${turnNumber}`);
  // Clean up the key
  await client.DEL(key);
  return false;
}

/**
 * Signal that audio playback is complete (called by frontend)
 */
export async function signalAudioPlaybackComplete(
  gameId: string,
  turnNumber: number
): Promise<void> {
  const client = await getRedisClient();
  const key = buildAudioPlaybackKey(gameId, turnNumber);

  await client.SET(key, "true");
  await client.expire(key, 60); // Expire after 1 minute in case backend never picks it up

  console.log(`[AUDIO] Audio playback signal set for turn ${turnNumber}`);
}
