# Story Clash Codex

Story Clash is a realtime multiplayer narrative battle game built with Next.js App Router, TypeScript, Tailwind CSS, Framer Motion, and Socket.io.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project layout

- `src/app` - App routes and API routes
- `src/lib` - Core game logic, room/session state, socket client, utilities
- `src/types` - Shared TypeScript models
- `src/data/stories` - Branching story trees (JSON)
- `server` - Express + Next + Socket.io custom server
- `supabase/schema.sql` - Launch schema for Supabase/Postgres
- `docs/specs` - Product spec PDFs
- `archive/legacy-humanity-speaks` - Archived legacy code from prior app

## Core routes

- `/`
- `/create`
- `/join`
- `/lobby/[code]`
- `/minigame/[code]`
- `/game/[code]`
- `/recap/[code]`

## Notes

- Room/session state is in-memory for V1 local development.
- Supabase schema is provided for production persistence.
- Room codes are 4 uppercase letters excluding `O` and `I`.
