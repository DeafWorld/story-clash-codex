# Story Clash Unity Migration v1 (6-Week ROI Spec)

## Architecture Lock
- Unity client is the primary presentation runtime.
- TypeScript authority remains in `/Users/deafgod/Desktop/Codex/src/lib/store.ts` and `/Users/deafgod/Desktop/Codex/cloudflare/src/room-do.ts`.
- Realtime protocol is versioned under `/Users/deafgod/Desktop/Codex/protocol/`.

## Vertical Slice Scope (Included)
- GM loop only: `reading -> readiness gate -> choices -> timer -> vote lock -> consequence -> recap`.
- Reconnect snapshot restore for `reading`, `voting_open`, `vote_locked`, and `writing_consequence`.
- Deterministic vote lock parity for majority and tie-break behavior.

## Out of Scope (This 6-Week Window)
- Full classic mode parity in Unity.
- Content authoring tool migration.
- Long-term persistence beyond current transcript export and recap outputs.

## Performance Budgets
- High-tier device: p95 frame time <= 16.7ms during `voting_open`.
- Mid-tier device: p95 frame time <= 33.3ms with quality downgrade.
- Peak memory over 5-beat session: no monotonic growth trend after warm-up.
- Reconnect resync target: <= 1.2s to usable state.

## Graphics Style Bible (Execution-Level)
- Rendering pipeline: URP.
- Post stack: vignette + restrained bloom + scene color grading LUT.
- Rift visual language: contamination tint + pressure pulse + fracture cue.
- Typography priority: story text first, controls second, diagnostics hidden by default.
- Motion rule: transitions support readability; never obscure choice legibility.

## Asset Pipeline
- Naming: `category_context_variant_vNN`.
- Atlas groups by phase: `reading`, `voting`, `lock`, `recap`.
- Lottie/Rive imported with capped memory budget and fallback static equivalents.
- Shader Graph assets versioned and reviewed with screenshot diffs.

## Telemetry and KPI Map
- Handshake: `client_hello`, `server_hello` acceptance rates.
- Session funnel: beat publish -> all ready -> vote lock -> consequence -> recap share.
- Quality: vote latency, reconnect recovery time, tick drift incidents.
- Performance: fps sample, long-frame rate, quality tier switches.

## Weekly Stop/Go Gates
- Week 1: protocol + traces + architecture docs complete.
- Week 2: Unity slice reaches vote lock with authority-backed state.
- Week 3: deterministic parity confirmed against golden traces.
- Week 4: URP + contamination visuals pass readability QA.
- Week 5: performance budgets pass on target devices.
- Week 6: alpha gate: >=8/10 sessions recap, zero blockers.

## Alpha Test Script (10 Sessions)
1. First-time GM run (no coaching).
2. Mobile-only player room.
3. Forced reconnect in each live phase.
4. Split vote and tie-break scenarios.
5. Freeform-heavy voting round.

## Launch Gate
- >=8/10 sessions reach recap.
- >=7/10 GMs report rerun intent.
- Zero gameplay-blocking defects open.
