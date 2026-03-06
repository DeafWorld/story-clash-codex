# ADR-0001: Unity Client with Existing TypeScript Authority

## Status
Accepted

## Context
Story Clash needs rapid quality uplift toward Unity-grade rendering while preserving deterministic multiplayer behavior already implemented in Node and Cloudflare authority paths.

## Decision
- Keep existing authoritative state engines in TypeScript.
- Add protocol versioning and handshake (`client_hello`, `server_hello`).
- Add snapshot metadata (`snapshotVersion`, `serverTimeMs`, `tick`) to `gm_state_update`.
- Build Unity as a protocol consumer first, not as gameplay authority.

## Consequences
### Positive
- Fastest path to visual quality gains without rewriting game logic.
- Deterministic behavior parity remains centralized.
- Lower migration risk for reconnect and vote lock semantics.

### Negative
- Dual-runtime complexity during migration period.
- Protocol governance becomes mandatory.

## Revisit Trigger
Revisit when Unity vertical slice and parity suite both pass for two consecutive weekly alpha cycles.
