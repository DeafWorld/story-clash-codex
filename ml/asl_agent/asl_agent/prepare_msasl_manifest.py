from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build clip manifest CSV from MS-ASL-like annotations")
    parser.add_argument("--input-json", type=Path, required=True)
    parser.add_argument("--output-csv", type=Path, required=True)
    parser.add_argument(
        "--default-split",
        default="train",
        help="Used when annotation does not expose split/subset",
    )
    return parser.parse_args()


def _pick_first(d: dict, keys: list[str], default: str = "") -> str:
    for key in keys:
        if key in d and d[key] is not None:
            return str(d[key])
    return default


def main() -> None:
    args = parse_args()
    records = json.loads(args.input_json.read_text(encoding="utf-8"))

    if not isinstance(records, list):
        raise ValueError("Expected annotation JSON to be a list of objects")

    rows: list[dict[str, str]] = []
    for item in records:
        if not isinstance(item, dict):
            continue

        label = _pick_first(item, ["clean_text", "text", "label", "gloss"]).strip()
        if not label:
            continue

        clip_path = _pick_first(item, ["path", "clip_path", "video_path", "video"]).strip()
        if not clip_path:
            video_id = _pick_first(item, ["video_id", "id"]).strip()
            if video_id:
                clip_path = f"{video_id}.mp4"
            else:
                continue

        split = _pick_first(item, ["split", "subset"], default=args.default_split).lower()
        signer_id = _pick_first(item, ["signer_id", "signer", "person_id"], default="unknown")

        rows.append(
            {
                "path": clip_path,
                "label": label,
                "split": split,
                "signer_id": signer_id,
            }
        )

    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    with args.output_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["path", "label", "split", "signer_id"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"wrote {len(rows)} rows -> {args.output_csv}")


if __name__ == "__main__":
    main()
