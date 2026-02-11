# Cloudflare Worker Backend

This folder contains the zero-cost always-on backend for Story Clash:
- HTTP API routes (`/api/rooms/*`, `/api/game/*`, `/api/recap/*`)
- Native WebSocket realtime endpoint (`/ws`)
- Durable Object per room (`RoomDurableObject`)

## Local Dev (Worker)

```bash
cd cloudflare
npx wrangler dev
```

## Deploy

```bash
cd cloudflare
npx wrangler deploy
```

## Required Frontend Env Vars

Set in your Next.js host:

- `NEXT_PUBLIC_REALTIME_TRANSPORT=ws`
- `NEXT_PUBLIC_API_BASE_URL=https://<your-worker>.workers.dev`
- `NEXT_PUBLIC_WS_BASE_URL=wss://<your-worker>.workers.dev`

Optional:

- `NEXT_PUBLIC_SOCKET_URL` only for local `socketio` fallback mode.
