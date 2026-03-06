from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from tqdm import tqdm

from asl_agent.data import (
    AlphabetImageDataset,
    IsolatedSignClipDataset,
    IsolatedSignClipFolderDataset,
)
from asl_agent.data.transforms import (
    build_eval_image_transform,
    build_train_image_transform,
)
from asl_agent.models import StaticSignRecognizer, TemporalSignRecognizer
from asl_agent.utils import accuracy_at_k, load_checkpoint, save_checkpoint


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train standalone ASL recognizers")
    parser.add_argument("--task", choices=["alphabet", "isolated"], required=True)

    parser.add_argument("--data-root", type=Path, help="Alphabet dataset root")
    parser.add_argument(
        "--isolated-source",
        choices=["manifest", "folder"],
        default="manifest",
        help="Input source for isolated sign training",
    )
    parser.add_argument(
        "--isolated-root",
        type=Path,
        help="Root directory for split/class/clip/frame layout (for --isolated-source folder)",
    )
    parser.add_argument("--manifest-csv", type=Path, help="Video manifest CSV")
    parser.add_argument("--clips-root", type=Path, default=None, help="Base path for clip files")
    parser.add_argument(
        "--frame-extensions",
        default="jpg,jpeg,png",
        help="Comma-separated frame extensions for folder clips",
    )
    parser.add_argument("--train-split", default="train")
    parser.add_argument("--val-split", default="val")

    parser.add_argument("--image-size", type=int, default=224)
    parser.add_argument("--sequence-length", type=int, default=16)

    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--label-smoothing", type=float, default=0.0)
    parser.add_argument("--grad-clip", type=float, default=1.0)

    parser.add_argument("--pretrained", action="store_true", help="Use ImageNet weights")
    parser.add_argument("--dropout", type=float, default=0.3)
    parser.add_argument("--hidden-size", type=int, default=256)
    parser.add_argument("--lstm-layers", type=int, default=2)
    parser.add_argument("--temporal-pool", choices=["last", "mean", "max"], default="last")

    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda", "mps"])
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--checkpoint-dir", type=Path, default=Path("checkpoints"))
    parser.add_argument("--resume", type=Path, default=None)
    parser.add_argument("--eval-only", action="store_true")

    return parser.parse_args()


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def resolve_device(flag: str) -> torch.device:
    if flag == "auto":
        if torch.cuda.is_available():
            return torch.device("cuda")
        mps_backend = getattr(torch.backends, "mps", None)
        if mps_backend and mps_backend.is_available():
            return torch.device("mps")
        return torch.device("cpu")
    return torch.device(flag)


def build_dataloaders(args: argparse.Namespace):
    train_tf = build_train_image_transform(args.image_size)
    eval_tf = build_eval_image_transform(args.image_size)

    if args.task == "alphabet":
        if args.data_root is None:
            raise ValueError("--data-root is required for --task alphabet")

        train_set = AlphabetImageDataset(args.data_root, split=args.train_split, transform=train_tf)
        val_set = AlphabetImageDataset(args.data_root, split=args.val_split, transform=eval_tf)
    else:
        if args.isolated_source == "manifest":
            if args.manifest_csv is None:
                raise ValueError("--manifest-csv is required for --isolated-source manifest")

            train_set = IsolatedSignClipDataset(
                manifest_csv=args.manifest_csv,
                split=args.train_split,
                transform=train_tf,
                sequence_length=args.sequence_length,
                clips_root=args.clips_root,
            )
            val_set = IsolatedSignClipDataset(
                manifest_csv=args.manifest_csv,
                split=args.val_split,
                transform=eval_tf,
                sequence_length=args.sequence_length,
                clips_root=args.clips_root,
            )
        else:
            if args.isolated_root is None:
                raise ValueError("--isolated-root is required for --isolated-source folder")

            frame_extensions = tuple(
                ext.strip().lower()
                for ext in args.frame_extensions.split(",")
                if ext.strip()
            )
            train_split_dir = args.isolated_root / args.train_split
            val_split_dir = args.isolated_root / args.val_split

            train_set = IsolatedSignClipFolderDataset(
                split_dir=train_split_dir,
                transform=train_tf,
                sequence_length=args.sequence_length,
                class_names=None,
                frame_extensions=frame_extensions,
            )
            val_set = IsolatedSignClipFolderDataset(
                split_dir=val_split_dir,
                transform=eval_tf,
                sequence_length=args.sequence_length,
                class_names=train_set.classes,
                frame_extensions=frame_extensions,
            )

    class_names = train_set.classes
    if class_names != val_set.classes:
        raise ValueError("Train/val class mapping mismatch")

    pin_memory = torch.cuda.is_available()
    train_loader = DataLoader(
        train_set,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.workers,
        pin_memory=pin_memory,
        drop_last=True,
    )
    val_loader = DataLoader(
        val_set,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.workers,
        pin_memory=pin_memory,
        drop_last=False,
    )

    return train_loader, val_loader, class_names


def build_model(args: argparse.Namespace, num_classes: int) -> nn.Module:
    if args.task == "alphabet":
        return StaticSignRecognizer(
            num_classes=num_classes,
            pretrained=args.pretrained,
            dropout=args.dropout,
        )

    return TemporalSignRecognizer(
        num_classes=num_classes,
        pretrained=args.pretrained,
        hidden_size=args.hidden_size,
        lstm_layers=args.lstm_layers,
        dropout=args.dropout,
        temporal_pool=args.temporal_pool,
    )


def run_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer | None,
    device: torch.device,
    grad_clip: float,
) -> dict[str, float]:
    training = optimizer is not None
    model.train(training)

    running_loss = 0.0
    running_top1 = 0.0
    running_top5 = 0.0
    seen = 0

    for inputs, targets in tqdm(loader, disable=False):
        inputs = inputs.to(device)
        targets = targets.to(device)

        if training:
            optimizer.zero_grad(set_to_none=True)

        with torch.set_grad_enabled(training):
            logits = model(inputs)
            loss = criterion(logits, targets)

            if training:
                loss.backward()
                if grad_clip > 0:
                    torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=grad_clip)
                optimizer.step()

        topk = (1, min(5, logits.size(1)))
        top1, top5 = accuracy_at_k(logits, targets, topk=topk)

        batch_size = targets.shape[0]
        running_loss += loss.item() * batch_size
        running_top1 += top1.item() * batch_size
        running_top5 += top5.item() * batch_size
        seen += batch_size

    return {
        "loss": running_loss / max(seen, 1),
        "top1": running_top1 / max(seen, 1),
        "top5": running_top5 / max(seen, 1),
    }


def main() -> None:
    args = parse_args()
    set_seed(args.seed)

    device = resolve_device(args.device)
    train_loader, val_loader, class_names = build_dataloaders(args)

    model = build_model(args, num_classes=len(class_names)).to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=args.lr,
        weight_decay=args.weight_decay,
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(args.epochs, 1))
    criterion = nn.CrossEntropyLoss(label_smoothing=args.label_smoothing)

    start_epoch = 0
    best_val_top1 = 0.0

    if args.resume:
        checkpoint = load_checkpoint(args.resume, map_location=device)
        model.load_state_dict(checkpoint["model_state"])
        if "optimizer_state" in checkpoint and checkpoint["optimizer_state"]:
            optimizer.load_state_dict(checkpoint["optimizer_state"])
        start_epoch = int(checkpoint.get("epoch", 0)) + 1
        best_val_top1 = float(checkpoint.get("best_val_top1", 0.0))

    args.checkpoint_dir.mkdir(parents=True, exist_ok=True)
    labels_path = args.checkpoint_dir / f"{args.task}_labels.json"
    labels_path.write_text(json.dumps(class_names, indent=2), encoding="utf-8")

    if args.eval_only:
        val_stats = run_epoch(
            model=model,
            loader=val_loader,
            criterion=criterion,
            optimizer=None,
            device=device,
            grad_clip=0.0,
        )
        print(
            f"eval loss={val_stats['loss']:.4f} "
            f"top1={val_stats['top1']:.2f} top5={val_stats['top5']:.2f}"
        )
        return

    for epoch in range(start_epoch, args.epochs):
        train_stats = run_epoch(
            model=model,
            loader=train_loader,
            criterion=criterion,
            optimizer=optimizer,
            device=device,
            grad_clip=args.grad_clip,
        )

        val_stats = run_epoch(
            model=model,
            loader=val_loader,
            criterion=criterion,
            optimizer=None,
            device=device,
            grad_clip=0.0,
        )

        scheduler.step()

        print(
            f"epoch={epoch} "
            f"train_loss={train_stats['loss']:.4f} train_top1={train_stats['top1']:.2f} "
            f"val_loss={val_stats['loss']:.4f} val_top1={val_stats['top1']:.2f} "
            f"val_top5={val_stats['top5']:.2f}"
        )

        last_path = args.checkpoint_dir / f"{args.task}_last.pt"
        save_checkpoint(
            last_path,
            model_state=model.state_dict(),
            optimizer_state=optimizer.state_dict(),
            epoch=epoch,
            best_val_top1=max(best_val_top1, val_stats["top1"]),
            class_names=class_names,
            model_type=args.task,
        )

        if val_stats["top1"] >= best_val_top1:
            best_val_top1 = val_stats["top1"]
            best_path = args.checkpoint_dir / f"{args.task}_best.pt"
            save_checkpoint(
                best_path,
                model_state=model.state_dict(),
                optimizer_state=optimizer.state_dict(),
                epoch=epoch,
                best_val_top1=best_val_top1,
                class_names=class_names,
                model_type=args.task,
            )

    print(f"best_val_top1={best_val_top1:.2f}")


if __name__ == "__main__":
    main()
