from __future__ import annotations

from pathlib import Path
from typing import Any

import torch


def save_checkpoint(
    path: str | Path,
    *,
    model_state: dict[str, Any],
    optimizer_state: dict[str, Any],
    epoch: int,
    best_val_top1: float,
    class_names: list[str],
    model_type: str,
) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    torch.save(
        {
            "epoch": epoch,
            "best_val_top1": best_val_top1,
            "class_names": class_names,
            "model_type": model_type,
            "model_state": model_state,
            "optimizer_state": optimizer_state,
        },
        path,
    )


def load_checkpoint(path: str | Path, map_location: str | torch.device = "cpu") -> dict[str, Any]:
    checkpoint = torch.load(path, map_location=map_location)
    required = {"model_state", "class_names", "model_type"}
    missing = required - set(checkpoint.keys())
    if missing:
        raise ValueError(f"Checkpoint missing fields: {sorted(missing)}")
    return checkpoint
