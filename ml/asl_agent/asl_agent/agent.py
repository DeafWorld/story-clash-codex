from __future__ import annotations

from dataclasses import dataclass

import torch

from asl_agent.models import StaticSignRecognizer, TemporalSignRecognizer
from asl_agent.utils import load_checkpoint


@dataclass(frozen=True)
class Prediction:
    index: int
    label: str
    confidence: float


def resolve_device(flag: str) -> torch.device:
    if flag == "auto":
        if torch.cuda.is_available():
            return torch.device("cuda")
        mps_backend = getattr(torch.backends, "mps", None)
        if mps_backend and mps_backend.is_available():
            return torch.device("mps")
        return torch.device("cpu")
    return torch.device(flag)


def build_model(model_type: str, num_classes: int) -> torch.nn.Module:
    if model_type == "alphabet":
        return StaticSignRecognizer(num_classes=num_classes, pretrained=False)

    if model_type == "isolated":
        return TemporalSignRecognizer(num_classes=num_classes, pretrained=False)

    raise ValueError("model_type must be one of: alphabet, isolated")


class ASLAgent:
    """Local inference wrapper for standalone ASL recognition."""

    def __init__(
        self,
        checkpoint_path: str,
        *,
        model_type: str | None = None,
        device: str = "auto",
    ) -> None:
        self.device = resolve_device(device)

        checkpoint = load_checkpoint(checkpoint_path, map_location=self.device)
        self.class_names = list(checkpoint["class_names"])
        self.model_type = model_type or checkpoint.get("model_type")
        if self.model_type not in {"alphabet", "isolated"}:
            raise ValueError("Checkpoint has unknown model_type. Provide model_type explicitly.")

        self.model = build_model(self.model_type, num_classes=len(self.class_names))
        self.model.load_state_dict(checkpoint["model_state"])
        self.model.to(self.device)
        self.model.eval()

    @torch.inference_mode()
    def predict_clip(self, clip_tensor: torch.Tensor, top_k: int = 3) -> tuple[list[Prediction], torch.Tensor]:
        """Predict labels for a clip tensor.

        Args:
            clip_tensor: [T, C, H, W] or [B, T, C, H, W]
        """
        if self.model_type != "isolated":
            raise ValueError("predict_clip requires an 'isolated' checkpoint/model")

        if clip_tensor.ndim == 4:
            clip_tensor = clip_tensor.unsqueeze(0)
        if clip_tensor.ndim != 5:
            raise ValueError("clip_tensor must have shape [T, C, H, W] or [B, T, C, H, W]")

        logits = self.model(clip_tensor.to(self.device))
        probs = torch.softmax(logits, dim=-1)[0].cpu()

        k = min(top_k, probs.numel())
        top_probs, top_indices = probs.topk(k)
        predictions = [
            Prediction(
                index=int(idx.item()),
                label=self.class_names[int(idx.item())],
                confidence=float(score.item()),
            )
            for score, idx in zip(top_probs, top_indices, strict=False)
        ]
        return predictions, probs

    @torch.inference_mode()
    def predict_frame(self, frame_tensor: torch.Tensor, top_k: int = 3) -> tuple[list[Prediction], torch.Tensor]:
        """Predict labels for a static frame.

        Args:
            frame_tensor: [C, H, W] or [B, C, H, W]
        """
        if self.model_type != "alphabet":
            raise ValueError("predict_frame requires an 'alphabet' checkpoint/model")

        if frame_tensor.ndim == 3:
            frame_tensor = frame_tensor.unsqueeze(0)
        if frame_tensor.ndim != 4:
            raise ValueError("frame_tensor must have shape [C, H, W] or [B, C, H, W]")

        logits = self.model(frame_tensor.to(self.device))
        probs = torch.softmax(logits, dim=-1)[0].cpu()

        k = min(top_k, probs.numel())
        top_probs, top_indices = probs.topk(k)
        predictions = [
            Prediction(
                index=int(idx.item()),
                label=self.class_names[int(idx.item())],
                confidence=float(score.item()),
            )
            for score, idx in zip(top_probs, top_indices, strict=False)
        ]
        return predictions, probs
