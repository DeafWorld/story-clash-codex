# Story Clash "Rift" Digest + Build Plan

## Source Bundle Reviewed
- `/Users/deafgod/Desktop/Codex/files/story-clash-redesign.md`
- `/Users/deafgod/Desktop/Codex/files/implementation-guide.md`
- `/Users/deafgod/Desktop/Codex/files/story-structure-example.json`
- `/Users/deafgod/Desktop/Codex/files/rift-prototype.html`

## Core Thesis (What This Changes)
The bundle reframes Story Clash from "branching story game" to a "collaborative narrative volatility system":
- choices do not only pick branches, they shift genre pressure;
- genre pressure should alter tone/mechanics mid-session via events;
- sessions should accumulate into persistent continuity (world scars, artifacts, memory);
- sharing and replay should be identity-based (Story DNA).

This is a strong direction. The key is to implement it as a controlled progression, not a full rewrite.

## Product Reframe for Current Beta
Given current constraints (free infra, multiplayer stability, choice-only input), the practical model is:
1. Keep the existing room/minigame/story/recap loop.
2. Introduce a `Genre Balance` state that mutates from each choice.
3. Add deterministic `Rift Events` at defined checkpoints (not random spam).
4. Persist lightweight `Episode Continuity` (flags/scars/artifacts) in room/session state.
5. Add `Story DNA` share token to recap.

This preserves what works and upgrades depth.

## What to Keep vs Defer

### Keep Now (High Value, Low Risk)
- Genre balance meter and dominant-genre UI effects.
- Rift Event interrupts every N scenes or when thresholds are hit.
- Consequence flags and world scars.
- Episode recap with continuity payload.
- Story DNA share metadata.

### Defer (Until Core Loop Is Stable)
- LLM-generated story text.
- User-generated story editors/modding.
- Voice systems/advanced narrator controls.
- Complex global live ops/challenges.

## Concrete Architecture Delta

### 1) Domain Types
Add to `src/types/game.ts` (and Cloudflare mirror):
- `GenrePower = { horror:number; romance:number; scifi:number; fantasy:number; comedy:number }`
- `RiftEvent = { id:string; type:string; trigger:string; text:string; effects:... }`
- `WorldScar = { id:string; unlockedAt:number; effect:string }`
- `Artifact = { id:string; uses:number; effect:string }`
- Extend room/story state with:
  - `genrePower`
  - `chaosLevel`
  - `riftHistory`
  - `worldScars`
  - `artifacts`

### 2) Authoritative State Engine
Implement in:
- `src/lib/store.ts`
- `cloudflare/src/room-do.ts`

Rules:
- each selected choice applies `genreShift` deltas;
- `chaosLevel` derived from variance and/or contamination proximity;
- run `evaluateRiftEvent(state, scene)` after each choice;
- apply event effects server-side, then broadcast with `scene_update` + `narrator_update`.

### 3) Story Schema
Move from simple nodes to node + mechanics payload:
- `genreShift` on choices;
- optional `riftEventChance` or deterministic trigger tags;
- scene variants for dominant genre.

Use migration-compatible fields first to avoid breaking current trees.

### 4) Client UI
Update game screen:
- display genre bars + chaos meter;
- render active Rift Event banner between scene transitions;
- keep choices as primary interaction (already aligned).

## 3-Milestone Implementation Plan

### Milestone 1: "Rift Core" (1 week)
- Add `genrePower` and deterministic `riftEvent` evaluation.
- Add 2 event types:
  - `genre_surge` (boost a genre)
  - `scene_twist` (force scene variant / temporary modifier)
- Surface in UI + recap.

### Milestone 2: "Continuity" (1 week)
- Add `worldScars` + simple `artifacts` + carry-forward flags.
- Persist through restart flow for episodic mode.
- Include continuity panel in recap.

### Milestone 3: "Social Loop" (1 week)
- Generate `Story DNA` from genre history + ending + scars.
- Add share links with DNA payload.
- Add recap import/bootstrap from DNA seed (deterministic replay).

## Acceptance Criteria
- A run can visibly shift genre dominance 4+ times.
- At least one Rift Event fires in normal sessions and changes subsequent state.
- Recap includes genre trajectory + event timeline + scars/artifacts.
- Story DNA is generated and shareable from recap.
- Multiplayer clients remain synchronized on genre/event state.

## Risks + Mitigations
- Risk: chaos feels random/noisy.
  - Mitigation: deterministic triggers + caps per session.
- Risk: schema churn breaks existing stories.
  - Mitigation: backward-compatible parsing in story-utils.
- Risk: multiplayer drift.
  - Mitigation: all event resolution server/DO authoritative only.

## Immediate Next Actions
1. Add new state/types for `genrePower`, `chaosLevel`, and `riftHistory`.
2. Implement `applyChoiceConsequences()` + `evaluateRiftEvent()` in authoritative engines.
3. Add game UI widget for genre bars + chaos.
4. Add recap timeline block for "Rift Events This Session".
5. Add Story DNA generation and share surface.
