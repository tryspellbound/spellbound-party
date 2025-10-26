# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Spellbound Party is an AI-powered interactive storytelling party game built with Next.js. Players join via mobile devices to participate in a collaborative story that's displayed on a shared "TV" screen. The game uses AI to generate turn-based narrative continuations and accompanying images.

## Development Commands

```bash
# Start development server (runs on http://localhost:3000)
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Required Environment Variables

Configure in `.env.local`:

- `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD` - Redis connection for game state storage
- `OPENROUTER_API_KEY` - API key for OpenRouter (text generation via LLM)
- `OPENROUTER_MODEL` - Model identifier (defaults to `openai/gpt-4o-mini`)
- `OPENAI_API_KEY` - API key for OpenAI (image generation)
- `OPENAI_IMAGE_MODEL` - Image model (defaults to `gpt-image-1-mini`)
- `SITE_URL`, `SITE_NAME` - Optional site metadata for API requests

## Architecture

### Game Flow

1. **Lobby Phase**: A game is created with a unique 4-character code. Players scan a QR code or visit `/play/[gameId]` to join
2. **In-Progress Phase**: Once started from the TV view (`/tv/[gameId]`), the turn engine generates story beats in a loop
3. **Turn Generation**: Each turn streams narration text and generates an accompanying image in parallel

### Core Data Model

**GameState** ([src/types/game.ts](src/types/game.ts)):
- Tracks game status (`lobby` or `in-progress`)
- Contains array of `Player` objects (each with id, name, avatar)
- Contains array of `GameTurn` objects (each with continuation text, imagePrompt, and generated image)

### State Management

**Redis-backed persistence** ([src/lib/gameStore.ts](src/lib/gameStore.ts)):
- All game state is stored in Redis with keys like `game:ABCD`
- Game codes are generated from a safe alphabet (no ambiguous characters)
- Functions: `createGame()`, `getGame()`, `addPlayerToGame()`, `startGame()`, `appendTurnToGame()`

**Global Redis client** ([src/lib/redis.ts](src/lib/redis.ts)):
- Uses a singleton pattern with `global._redisClient` to avoid multiple connections
- Validates required environment variables on first connection

### AI Generation

**Text Generation** ([src/services/textGeneration.ts](src/services/textGeneration.ts)):
- Uses OpenRouter's streaming API for narrative generation
- System prompt is rendered via Liquid templates ([src/lib/promptRenderer.ts](src/lib/promptRenderer.ts))
- Template file: [src/templates/game_loop_system.liquid](src/templates/game_loop_system.liquid)
- The LLM returns XML with `<turn>`, `<continuation>`, and `<image_prompt>` tags

**Image Generation** ([src/services/imageGeneration.ts](src/services/imageGeneration.ts)):
- Uses OpenAI's streaming image API with partial image support
- Generates 1024x1536 PNG images with 3 partial image updates during generation

### API Routes

**Game Management**:
- `POST /api/games` - Create a new game
- `GET /api/games/[gameId]` - Fetch game state
- `POST /api/games/[gameId]/players` - Add a player to game
- `POST /api/games/[gameId]/start` - Start the game

**Turn Streaming**:
- `GET /api/games/[gameId]/turns/stream` - Server-Sent Events (SSE) endpoint
  - Streams events: `turn_status`, `continuation_chunk`, `image_prompt`, `image_partial`, `image_complete`, `turn_complete`
  - Generates text and image in parallel once the image prompt is detected in the LLM stream
  - Parses XML tags from the streaming response incrementally

### Views

**TV Screen** ([src/pages/tv/[gameId].tsx](src/pages/tv/[gameId].tsx)):
- Polls game state every 2 seconds
- Connects to `/api/games/[gameId]/turns/stream` via EventSource when engine is active
- Displays player list, turn controls, and current narration/image
- Implements a turn engine loop with 5-second cooldown between turns

**Player Join** ([src/pages/play/[gameId].tsx](src/pages/play/[gameId].tsx)):
- Allows players to join with a name and optional avatar (max 300KB)
- Polls game state to show other players
- Currently shows placeholder for "Your Inputs" tab (not yet implemented)

## Important Implementation Details

### Streaming & Parsing

The turn stream API ([src/pages/api/games/[gameId]/turns/stream.ts](src/pages/api/games/[gameId]/turns/stream.ts)) implements incremental XML parsing:
- `getTagSegment()` extracts partially-received tags from the buffer
- When `<image_prompt>` is complete, image generation starts immediately (parallel to text)
- `<continuation>` content is streamed to the client as it arrives
- CDATA blocks are stripped for clean output

### Avatar Handling

Avatars are base64-encoded data URLs:
- Must start with `data:image/`
- Limited to 300KB to prevent Redis bloat
- Stored directly in the game state JSON

### Path Aliases

The project uses `@/*` to reference `src/*` (configured in [tsconfig.json](tsconfig.json:16-18))

## Tech Stack

- **Framework**: Next.js 16 (Pages Router)
- **UI**: Radix UI Themes + Tailwind CSS 4
- **Template Engine**: LiquidJS for prompt rendering
- **State**: Redis for persistence
- **AI**: OpenRouter (text), OpenAI (images)
- **Utilities**: react-qr-code for join QR codes
