# Unity Vertical Slice Bootstrap

This folder tracks Unity-side bootstrap work for Story Clash protocol v1.

## Baseline Setup

1. Unity 2022 LTS (URP template)
2. TextMeshPro package enabled
3. Input System package enabled
4. Addressables enabled for motion/FX bundles

## Required Vertical Slice Scenes

- `Boot`
- `Lobby`
- `GMRuntime`
- `PlayerRuntime`
- `Recap`

## Protocol Contract

Use `/Users/deafgod/Desktop/Codex/protocol/` as source-of-truth for:

- handshake (`client_hello` / `server_hello`)
- event catalog (`gm-events.schema.json`)
- snapshot metadata (`snapshot.schema.json`)
- deterministic parity traces (`golden-traces/*.json`)

Unity parity stubs are stored under `/Users/deafgod/Desktop/Codex/unity/client-stubs/` and validated in CI via `npm run protocol:check`.

## Runtime Goals (6-week)

- Reproduce GM loop end-to-end against existing authoritative backend.
- Match deterministic vote lock and transcript behavior.
- Hit frame-time budgets from `/Users/deafgod/Desktop/Codex/docs/specs/unity-migration-v1.md`.
- Meet alpha launch gate in `unity/vertical-slice/Scripts/Runtime/Alpha/AlphaGateEvaluator.cs`.
