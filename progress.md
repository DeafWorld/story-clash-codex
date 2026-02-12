Original prompt: Build and iterate a playable web game in this workspace, validating changes with a Playwright loop.

- Re-entered task on current repository snapshot (`story-clash-codex`), which differs from earlier workspace state.
- Using existing custom Next+Express server flow and implementing a dedicated canvas game route for deterministic Playwright validation.
- Added /public/arcade.html and /public/arcade.js playable canvas game with hooks: window.advanceTime, window.render_game_to_text, fullscreen toggle, and deterministic update loop.
- Linked arcade entry from home page CTA in /src/app/page.tsx.
- Tuned enemy difficulty after first Playwright pass: slower steering/speed, reduced initial swarm, delayed wave spawns, and longer post-hit invulnerability.
- Ran Playwright action-loop validation against `http://localhost:8000/arcade.html`; artifacts saved under `/Users/deafgod/Desktop/Codex/output/web-game` (shots + state JSON), with no emitted `errors-*.json` from the client.
- Verified screenshot artifacts manually for gameplay frames (not menu-only) and cross-checked state JSON fields (`mode`, `score`, `hp`, `key`, `enemies`, `shots`) against on-canvas outcomes.

TODO:
- `next` startup is currently blocked in this environment: `require("next")` and `app.prepare()` stall with no port bind; keep using static host loop for game iteration until runtime issue is fixed.
- Add dedicated pause/restart action suites once Playwright client process stability in this shell is improved (intermittent long-running client processes observed).

---

- Upgraded runtime deps to `next@14.2.35` and `eslint-config-next@14.2.35`; updated scripts to run server via `node --import tsx` to avoid `tsx` spawning a mismatched Node binary.
- Implemented startup hardening in `/server/index.ts`:
  - server now binds immediately in dev and serves `/public` assets without waiting on `app.prepare()`;
  - Next preparation in dev is opt-in via `NEXT_ENABLE_PREPARE=1`;
  - fallback responses return `503` JSON for non-public routes while Next is disabled/unready.
- Verified bind behavior: `npm run dev` now binds `:3000` in ~2s and returns `200` for `/arcade.html` (non-public route `/` returns `503` in fallback mode).
- Added deterministic game presets in `/public/arcade.js`:
  - `?testPreset=win` opens gate + grants key for deterministic gate-win path;
  - `?testPreset=lose` sets 1 HP + immediate enemy contact for deterministic lose path;
  - optional seeded RNG via `?seed=<int>`.
- Added deterministic action payloads:
  - `/scripts/arcade-actions-win.json`
  - `/scripts/arcade-actions-lose-restart.json`

New TODO:
- Resolve local Playwright runtime hang in this environment (`require("playwright")` and `$WEB_GAME_CLIENT` stall before artifact generation), then run:
  - win path against `http://127.0.0.1:3000/arcade.html?testPreset=win&seed=7`
  - lose→restart path against `http://127.0.0.1:3000/arcade.html?testPreset=lose&seed=7`
- After Playwright unblocks, verify screenshots + `state-*.json` + `errors-*.json` and tune frame counts if needed.

---

- Implemented "Aim High" narrator + social loop upgrade across Story Clash app and Cloudflare backend paths.
- Added deterministic narrator domain/types + engine:
  - `/Users/deafgod/Desktop/Codex/src/types/game.ts`
  - `/Users/deafgod/Desktop/Codex/src/types/realtime.ts`
  - `/Users/deafgod/Desktop/Codex/src/lib/narrator.ts`
  - `/Users/deafgod/Desktop/Codex/cloudflare/src/types.ts`
  - `/Users/deafgod/Desktop/Codex/cloudflare/src/narrator.ts`
- Wired narrator state + events into authoritative engines:
  - Node store: narration log/latest line in room state and recap payload (`/Users/deafgod/Desktop/Codex/src/lib/store.ts`)
  - Socket.IO server emits `narrator_update` and tracks `narrator_line_emitted` (`/Users/deafgod/Desktop/Codex/server/index.ts`)
  - Cloudflare DO emits `narrator_update` on scene enter/choice/timeout/ending and keeps narration in reconnect state (`/Users/deafgod/Desktop/Codex/cloudflare/src/room-do.ts`)
- Added narrator UI banner component and integrated into minigame/game/recap:
  - `/Users/deafgod/Desktop/Codex/src/components/narrator-banner.tsx`
  - `/Users/deafgod/Desktop/Codex/src/app/globals.css`
  - `/Users/deafgod/Desktop/Codex/src/app/minigame/[code]/page.tsx`
  - `/Users/deafgod/Desktop/Codex/src/app/game/[code]/page.tsx`
  - `/Users/deafgod/Desktop/Codex/src/app/recap/[code]/page.tsx`
  - Demo path updated to persist narrator context in `/Users/deafgod/Desktop/Codex/src/lib/demo-session.ts`.
- Upgraded invite attribution + join conversion loop:
  - Invite URLs now include `from=invite` and `inviter` (`/Users/deafgod/Desktop/Codex/src/lib/invite.ts`)
  - Top bar invite passes inviter metadata (`/Users/deafgod/Desktop/Codex/src/components/session-top-bar.tsx`)
  - Join page parses attribution, shows invite banner, autofocuses name, tracks `invite_opened`/`join_prefilled` (`/Users/deafgod/Desktop/Codex/src/app/join/page.tsx`).
- Upgraded recap sharing flow:
  - Recap API share text + OG subtitle now include narrator-flavored one-liner (`/Users/deafgod/Desktop/Codex/src/app/api/share/recap/[code]/route.ts`, `/Users/deafgod/Desktop/Codex/src/app/api/og/recap/route.tsx`)
  - Recap page CTA order changed: Share Story primary, Play Again with Same Crew secondary; tracks `recap_shared` and `play_again_clicked`.
- Added analytics event types in `/Users/deafgod/Desktop/Codex/src/lib/analytics.ts` and instrumentation points for narrator/social funnel.
- Added/updated tests:
  - new `/Users/deafgod/Desktop/Codex/tests/narrator.test.ts`
  - updated `/Users/deafgod/Desktop/Codex/tests/store-flow.test.ts`
  - updated `/Users/deafgod/Desktop/Codex/tests/realtime-envelope.test.ts`
  - updated `/Users/deafgod/Desktop/Codex/tests/invite-utils.test.ts`
  - updated `/Users/deafgod/Desktop/Codex/tests/e2e/smoke.spec.ts`
  - updated `/Users/deafgod/Desktop/Codex/tests/e2e/live-multiplayer.spec.ts`

Verification notes:
- Quick runtime smoke scripts for core modules executed successfully earlier in this turn (`narrator`, `invite`, `store`, `cloudflare room-do`).
- Full `npm run lint`, `vitest`, and `next build` commands intermittently stalled in this shell environment (multiple tool invocations stuck with zero CPU and no terminal output). Process cleanup was performed repeatedly, but the issue persisted.

TODO:
- Re-run full gates in a clean shell/session:
  - `npm run lint`
  - `npx vitest run`
  - `npm run build -- --no-lint` (or normal `npm run build` if lint runtime is stable)
- Run end-to-end multiplayer validation with both transports (`socketio` and `ws`) to verify `narrator_update` sync and recap/share behavior on real clients.

- User feedback: minigame quality below acceptable minimum; performed full gameplay overhaul in `/Users/deafgod/Desktop/Codex/src/app/minigame/[code]/page.tsx`.
- Replaced previous one-tap roulette with a stronger 3-attempt pressure-lock system per round:
  - deterministic strike-zone generation by room/round seed
  - moving pulse cursor with escalating speed across rounds
  - graded hit quality (`perfect/great/good/glance/miss`) + points
  - per-round bonuses (clear + time) and local total tracking
  - faster, deliberate progression through 3 rounds (attempt cap + timeout fallback)
- Updated both demo and realtime minigame implementations to keep existing room flow and Socket.io scoring contract.
- Preserved existing route flow and top-bar invite/back behavior.
- Updated live e2e expectations for new minigame control label and tap cadence in `/Users/deafgod/Desktop/Codex/tests/e2e/live-multiplayer.spec.ts`.
- Quick syntax sanity for rewritten minigame passed via TypeScript transpile check (`minigame-transpile-ok`).

TODO:
- Re-run lint/build/e2e once shell process hangs are resolved; current environment still intermittently stalls eslint/next/vitest commands.

- Implemented new wheel-based minigame flow per user request (`players choose pie -> wheel spins -> winner goes first -> tie wheel by names`).
- Updated `/Users/deafgod/Desktop/Codex/src/app/minigame/[code]/page.tsx`:
  - Added genre pie selection UI (Zombie/Alien/Haunted), spinning genre wheel animation, and names-only tie-break wheel.
  - Reworked realtime phase flow to `countdown -> picking -> spinning_genre -> spinning_tie (optional) -> submitting -> results -> revealed`.
  - Host now finalizes winner-first order after wheel resolution and auto-emits `genre_selected`; clients route to game together.
  - Demo mode mirrors the same wheel mechanics and carries selected genre into the story.
- Updated `/Users/deafgod/Desktop/Codex/src/lib/demo-session.ts`:
  - Demo session now supports multi-genre trees (`zombie`, `alien`, `haunted`) and winner-first turn order.
  - Fixed story progression bug by resolving story tree from `session.storyId` before node lookups.
- Updated demo story/game surfaces:
  - `/Users/deafgod/Desktop/Codex/src/app/game/[code]/page.tsx` now uses selected demo genre for overlay + title.
  - `/Users/deafgod/Desktop/Codex/src/app/recap/[code]/page.tsx` now shows dynamic demo story title.
- Intensified all story trees for stronger immersion and added consistent node structure fields (`tensionLevel`, `label/nextId` with compatibility fields) in:
  - `/Users/deafgod/Desktop/Codex/src/data/stories/zombie.json`
  - `/Users/deafgod/Desktop/Codex/src/data/stories/alien.json`
  - `/Users/deafgod/Desktop/Codex/src/data/stories/haunted.json`
- Updated e2e scripts to align with wheel flow:
  - `/Users/deafgod/Desktop/Codex/tests/e2e/smoke.spec.ts`
  - `/Users/deafgod/Desktop/Codex/tests/e2e/live-multiplayer.spec.ts`
- Server startup default changed in `/Users/deafgod/Desktop/Codex/server/index.ts` so dev Next prepare is enabled unless `NEXT_ENABLE_PREPARE=0`.

Validation notes:
- JSON story files parse cleanly via Node (`JSON_OK`).
- Full lint/typecheck/build/e2e commands still intermittently hang in this shell environment; unable to complete full gate run in this turn.

- Story depth pass implemented for all genres to strengthen immersion and reduce abrupt endings:
  - Added explicit twist nodes and extended branch depth to a minimum shortest-path of 4 choices.
  - `zombie.json`: new `checkpoint_twist` military quarantine reversal; early branches now route through this high-stakes beat before non-doom endings.
  - `alien.json`: new `echo_chamber` (voice-mimic trap) and `uplink_spire` finale gate; removed early direct endings.
  - `haunted.json`: new `undercroft` and `ritual_vault` beats; chapel no longer short-circuits to endings.
- Updated choice-path tests to match new zombie flow:
  - `/Users/deafgod/Desktop/Codex/tests/e2e/live-multiplayer.spec.ts` now performs 4 decisions to recap.
  - `/Users/deafgod/Desktop/Codex/tests/store-flow.test.ts` now expects game end on 4th decision via `checkpoint_twist`.
- Sanity checks executed via Node scripts:
  - All story JSON parses successfully.
  - All `nextId`, `freeChoiceTargetId`, and `freeChoiceKeywords` targets resolve to existing nodes.
  - Shortest ending depth now: zombie=4, alien=4, haunted=4.

- Removed free-answer mode for current gameplay phase (choice-only flow).
- UI: deleted free-text inputs/actions from game screens:
  - `/Users/deafgod/Desktop/Codex/src/app/game/[code]/page.tsx` (demo + realtime)
  - players now progress only through explicit choice buttons.
- Stories: removed all free-choice metadata from story JSON trees:
  - `/Users/deafgod/Desktop/Codex/src/data/stories/zombie.json`
  - `/Users/deafgod/Desktop/Codex/src/data/stories/alien.json`
  - `/Users/deafgod/Desktop/Codex/src/data/stories/haunted.json`
- Server authority hardened to choice-only:
  - `/Users/deafgod/Desktop/Codex/src/lib/store.ts`: `submitChoice` no longer accepts `freeText`, requires valid `choiceId` unless timeout.
  - `/Users/deafgod/Desktop/Codex/server/index.ts`: socket payload and logging no longer include free text.
  - `/Users/deafgod/Desktop/Codex/cloudflare/src/room-do.ts`: DO submit flow no longer accepts free text; enforces valid `choiceId` unless timeout.
- Demo session cleanup:
  - `/Users/deafgod/Desktop/Codex/src/lib/demo-session.ts`: removed demo free-choice advance path.
- UX text cleanup:
  - `/Users/deafgod/Desktop/Codex/src/components/tutorial-overlay.tsx` step 2 now reflects choice-only play.
  - `/Users/deafgod/Desktop/Codex/src/app/recap/[code]/page.tsx` removed free-choice recap lines.
- Test alignment:
  - `/Users/deafgod/Desktop/Codex/tests/story-utils.test.ts` free-choice utility test now uses synthetic scene data (independent of production story JSON).
- Data validation script run:
  - confirmed no `freeChoiceTargetId`/`freeChoiceKeywords` remain in story JSON.
  - confirmed all endings remain reachable via explicit choices in all three stories.
