# Lump Zero

`Lump-Zero` is a static niche asset factory for shipping focused utility sites quickly. It uses `npm` workspaces, `Vite + React` tool islands, and a Node prerender step to emit fully static sites with no backend requirement.

## Included Sites
- `etsy-image-helper`: export guidance for Etsy images, banners, icons, and profile graphics
- `cleaning-pricing`: working estimate calculator for independent house cleaners and small cleaning teams

## Workspace Layout
- `apps/site-*`: site wrappers and app-specific public assets
- `packages/ui`: shared shell, styling, and layout components
- `packages/seo`: metadata helpers
- `packages/content-engine`: brief-driven page generation
- `packages/tool-widgets`: reusable client-side calculators and helpers
- `packages/site-runtime`: shared prerender + hydration runtime
- `packages/analytics`: config-driven analytics adapter with Cloudflare-first support
- `packages/niche-config`: shared schemas and types
- `packages/quality-checks`: portfolio-quality checks for generated output
- `data/niche-briefs`: YAML briefs
- `data/sites.json`: manifest-driven site discovery
- `data/outputs`: scorecards and the operator view
- `scripts`: generation, build, check, score, export, archive, and Cloudflare deploy plumbing

## Core Commands
- `npm install`
- `npm run playwright:install`
- `npm run lint`
- `npm run smoke -- --all`
- `npm run typecheck`
- `npm run test`
- `npm run niche:generate -- --all`
- `npm run build`
- `npm run niche:check -- --all`
- `npm run niche:score`
- `npm run deploy:cloudflare:check`
- `npm run deploy:cloudflare:preview`
- `npm run deploy:cloudflare:production`

## Validation Notes
- `npm run lint` runs the workspace hygiene checks in `scripts/lint.ts`.
- `npm run test` runs the direct factory assertions in `scripts/run-tests.ts`.
- `npm run niche:check -- --all` verifies generated content, metadata, links, and prerender output for both sites.
- `npm run smoke -- --all [--mobile]` runs the Playwright-based browser smoke checks across the built static sites.

## Cloudflare-First Launch Path
1. Install the browser runtime with `npm run playwright:install`.
2. Build both sites with `npm run build`.
3. Run `npm run niche:check -- --all`.
4. Run `npm run smoke -- --all --mobile`.
5. Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
6. Enable Cloudflare Web Analytics in each Pages project, or set the manual beacon env vars from `data/sites.json` if you want to inject the script token during build.
7. Run `npm run deploy:cloudflare:check`.
8. Deploy with `npm run deploy:cloudflare:preview` or `npm run deploy:cloudflare:production`.

## Required Cloudflare Env
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Optional Cloudflare Env
- `CLOUDFLARE_WEB_ANALYTICS_TOKEN_ETSY_IMAGE_HELPER`
- `CLOUDFLARE_WEB_ANALYTICS_TOKEN_CLEANING_PRICING`
- `CLOUDFLARE_ANALYTICS_ENDPOINT_ETSY_IMAGE_HELPER`
- `CLOUDFLARE_ANALYTICS_ENDPOINT_CLEANING_PRICING`

## Playwright Runtime Note
- `Lump-Zero` now uses its own local `playwright` dependency for smoke coverage.
- The older `@playwright/mcp` wrapper expectation is not part of the repo workflow and may fail if `playwright-cli` is not globally available.

## Operator Visibility
Run `npm run niche:score` to refresh:
- `data/outputs/scoreboard.json`
- `data/outputs/operator-view.html`

## Adding A New Niche
1. Write a brief in `data/niche-briefs/` using the current schema.
2. Run `npm run niche:create -- --brief data/niche-briefs/<slug>.yaml`.
3. Add any site-specific public downloads under `apps/site-<slug>/public/downloads`.
4. Generate, build, check, and score the site before launch.
