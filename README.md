# Story Clash Codex

Realtime multiplayer narrative battle game built with Next.js App Router, TypeScript, Tailwind CSS, Framer Motion, and Socket.IO.

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

App: [http://localhost:3000](http://localhost:3000)

## Environment variables

Use `.env.example` as the source of truth. Key groups:

- Runtime: `NODE_ENV`, `PORT`, `APP_URL`, `NEXT_PUBLIC_APP_URL`
- Security: `SHARE_PROXY_SECRET`, `ADMIN_API_KEY`, `CRON_SECRET`
- Rate limits: `RATE_LIMIT_CREATE_ROOM_PER_MINUTE`, `RATE_LIMIT_JOIN_ROOM_PER_MINUTE`, `RATE_LIMIT_SHARE_PER_MINUTE`, `RATE_LIMIT_OG_PER_MINUTE`
- Realtime transport: `NEXT_PUBLIC_REALTIME_TRANSPORT`, `NEXT_PUBLIC_SOCKET_URL`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_WS_BASE_URL`
- Observability: `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, `PLAUSIBLE_DOMAIN`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`

## Production deployment

### Cloudflare Worker backend ($0 beta)

Use this when cutting over realtime + room APIs to Workers/Durable Objects:

```bash
npx wrangler login --browser=false
./scripts/cutover-cloudflare.sh
```

What the script does:

- deploys `cloudflare/wrangler.toml`
- extracts your live backend domain (`https://<worker>.<account>.workers.dev`)
- writes exact frontend envs into `.env.local`:
  - `NEXT_PUBLIC_REALTIME_TRANSPORT=ws`
  - `NEXT_PUBLIC_API_BASE_URL=https://...workers.dev`
  - `NEXT_PUBLIC_WS_BASE_URL=wss://...workers.dev`
- verifies `GET /healthz` on the deployed Worker

Domain note:

- Free backend domain: `*.workers.dev` (no purchase required)
- Free frontend domain: `*.vercel.app` (or `*.pages.dev` if using Cloudflare Pages)

### Vercel

1. Import this repo in Vercel.
2. Add all required env vars from `.env.example`.
3. Ensure `APP_URL` and `NEXT_PUBLIC_APP_URL` are set to your production domain.
4. Enable cron by keeping `vercel.json` in root:
   - `GET /api/cron/daily` runs daily at 08:00 UTC.
   - If `CRON_SECRET` is set, Vercel should send `Authorization: Bearer <CRON_SECRET>`.
5. Redeploy after env changes.

### Docker / Compose

Build and run:

```bash
docker compose up --build
```

- Dockerfile: `Dockerfile`
- Compose: `compose.yaml`
- Dev compose override: `compose.debug.yaml`
- Healthcheck endpoint: `GET /api/health`
- Compose healthcheck probes `/api/health` every 30s.

## Observability

- Structured logs: `src/lib/logger.ts`
- Runtime analytics counters and recent events:
  - API: `GET /api/analytics` (optionally protected by `x-admin-key`)
  - UI: `/analytics`
- Plausible:
  - Frontend script loads when `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` is set.
  - Server-side key events also attempt to forward to Plausible event API.
- Sentry:
  - Initialized in `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
  - Global app errors captured in `src/app/global-error.tsx`

## Sharing / OG proxy

- Create share link: `GET /api/share/recap/:code`
- Signed image endpoint: `GET /api/og/recap?token=...`
- Public share page: `/share/recap/:code?token=...`

The recap page now requests a signed share link and copies that link for social sharing.

## Testing and quality gates

```bash
npm run lint
npm run test
npm run test:e2e
```

- Unit/integration: Vitest (`tests/**/*.test.ts`)
- E2E: Playwright (`tests/e2e`)
- CI workflow: `.github/workflows/ci.yml` runs lint + unit + e2e

## Project layout

- App routes and APIs: `src/app`
- Core gameplay logic: `src/lib/store.ts`
- Realtime server: `server/index.ts`
- Cloudflare Worker backend option: `cloudflare/`
- DB schema (future persistence): `supabase/schema.sql`

## Notes

- Room/session data is currently in-memory for the Node runtime.
- This project currently has no Stripe integration, so webhook setup is not required in this repo.
