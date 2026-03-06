# Docs Index

Story Clash docs are organized by intent. Put new files in the right bucket to prevent root-folder clutter.

## Canonical Folders

- `docs/specs/`: product specs, roadmap PDFs, deploy guides.
- `docs/reviews/`: build reviews, scoring audits, and action-oriented critique.
- `docs/research/`: architecture notes, long-form systems design, simulation writeups.
- `docs/prototypes/`: experiments, mockups, and proof-of-concept artifacts.
- `docs/alpha/`: alpha-session scripts, launch gates, and scorecards.

## Existing References

- `docs/roadmap.txt`: extracted notes from the original roadmap PDF.
- `docs/roadmap_extracted.txt`: OCR/extraction variant for roadmap source material.
- `docs/specs/Story Clash Codex Spec.pdf`: current product specification document.
- `docs/specs/unity-migration-v1.md`: locked 6-week Unity migration and quality gates.
- `docs/research/adr-0001-unity-client-authoritative-backend.md`: authority split decision record.
- `docs/alpha/session-results.template.json`: template for 10-session alpha gate input.

## Naming Conventions

- Use lowercase kebab-case for new filenames.
- Prefix review snapshots with `YYYY-MM-` when tied to a specific review cycle.
- Keep exploratory artifacts out of repo root; use `docs/prototypes/` instead.

Archived legacy artifacts are stored under `archive/legacy-humanity-speaks/`.
