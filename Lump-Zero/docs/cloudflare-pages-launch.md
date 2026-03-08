# Cloudflare Pages Launch

## Default Model
- Host each site as its own Cloudflare Pages project.
- Let Cloudflare Web Analytics handle pageview and performance tracking on Pages.
- Keep custom interaction events behind the factory analytics adapter so a later Pages Function or Analytics Engine endpoint can be attached without changing site code.
- Standardize on API-token auth, not an interactive `wrangler login` session.

## Manifest Sources Of Truth
Project names, production branch defaults, and analytics env var names live in `data/sites.json`.

## Current Environment Hooks
- Required:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_WEB_ANALYTICS_TOKEN_ETSY_IMAGE_HELPER`
- `CLOUDFLARE_ANALYTICS_ENDPOINT_ETSY_IMAGE_HELPER`
- `CLOUDFLARE_WEB_ANALYTICS_TOKEN_CLEANING_PRICING`
- `CLOUDFLARE_ANALYTICS_ENDPOINT_CLEANING_PRICING`

## Deployment Flow
1. Run `npm run build`.
2. Run `npm run niche:check -- --all`.
3. Run `npm run smoke -- --all --mobile`.
4. Run `npm run deploy:cloudflare:check`.
5. Use `npm run deploy:cloudflare:preview` for preview pushes.
6. Use `npm run deploy:cloudflare:production` for production deploys.

## Notes
- If no manual token env var is set, the analytics adapter assumes Web Analytics is enabled in the Pages dashboard.
- If no custom event endpoint env var is set, custom tool events remain safely no-op while pageview/performance analytics still work on Pages.
- `npm run deploy:cloudflare:check` validates API-token auth, confirms the configured Pages projects exist, and reports optional analytics env vars without failing.
- If a Pages project is missing, create it in Cloudflare Pages first; the deploy preflight does not create projects automatically in v1.
- Cloudflare Web Analytics is the only required live analytics layer for the first launch. Keep custom event endpoints unset until traffic justifies them.
- `Lump-Zero` smoke coverage uses the repo-local `playwright` package. If Chromium is missing, run `npx playwright install chromium` from the workspace root.
