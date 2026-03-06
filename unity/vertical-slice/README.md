# Unity Vertical Slice (GM Loop)

This slice implements one complete authoritative loop against the existing TypeScript backend contract:

1. `reading`
2. readiness gate (`players + GM`)
3. `choices`
4. timer
5. deterministic vote lock
6. consequence
7. recap

## Runtime Scripts

- `Core/GmLoopStateMachine.cs`
  - phase machine and deterministic tie-break lock behavior.
- `Networking/AuthoritativeSnapshotReconciler.cs`
  - server-snapshot-wins reconciliation for reconnect replay safety.
- `UI/MobileVotingLayoutSpec.cs`
  - mobile parity constraints: 72-80px cards, thumb-zone assumptions, persistent timer.
- `Performance/PerformanceBudgetGate.cs`
  - p95 frame-time, long-frame %, memory-growth budget checks.
- `Visual/UrpVisualIdentityPass.cs`
  - URP grading + vignette + bloom baseline.
- `Visual/RiftContaminationSettings.cs`
  - contamination shader/material control for Rift identity.
- `FX/FxPool.cs`
  - pooled FX spawn/release path.
- `FX/QualityGovernor.cs`
  - quality downshift under frame pressure.
- `Analytics/SessionFunnelAnalyticsV2.cs`
  - handshake, read-to-ready, vote-lock, reconnect recovery, recap share reach.
- `Alpha/AlphaGateEvaluator.cs`
  - hard launch gate evaluator for 10-session alpha criteria.

## Protocol Source of Truth

- `/Users/deafgod/Desktop/Codex/protocol/gm-events.schema.json`
- `/Users/deafgod/Desktop/Codex/protocol/snapshot.schema.json`
- `/Users/deafgod/Desktop/Codex/protocol/protocol-version.ts`

Unity stubs that must stay in parity (CI-enforced):

- `/Users/deafgod/Desktop/Codex/unity/client-stubs/gm-events.stub.json`
- `/Users/deafgod/Desktop/Codex/unity/client-stubs/snapshot.stub.json`
- `/Users/deafgod/Desktop/Codex/unity/client-stubs/protocol-meta.stub.json`

## Acceptance Targets

- p95 frame-time <= 16.7ms (60fps tier), <= 33.3ms (30fps tier)
- long-frame rate <= 8% (60fps tier), <= 12% (30fps tier)
- no unbounded memory growth over a 5-beat session
- deterministic vote lock parity with backend traces
- reconnect restore parity during `reading`, `voting_open`, `vote_locked`, `writing_consequence`
