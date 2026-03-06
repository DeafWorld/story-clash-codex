# Story Clash Protocol v1

This folder is the source of truth for realtime contract and snapshot metadata used by web and Unity clients.

## Files
- `protocol-version.ts`: locked constants and handshake payload types.
- `gm-events.schema.json`: canonical event catalog for GM mode.
- `snapshot.schema.json`: required metadata contract for `gm_state_update`.
- `golden-traces/*.json`: deterministic behavior traces for parity checks.

## Handshake
Clients send:
- `client_hello { clientType, protocolVersion, buildId }`

Server responds:
- `server_hello { accepted, protocolVersion, capabilities, snapshotVersion, serverTimeMs, buildId, reason? }`

## Snapshot Metadata
Every `gm_state_update` includes:
- `snapshotVersion`
- `serverTimeMs`
- `tick`
