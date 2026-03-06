from __future__ import annotations

import torch
import torch.nn as nn
from torchvision.models import ResNet18_Weights, resnet18


class TemporalSignRecognizer(nn.Module):
    """ResNet18 frame encoder + BiLSTM for isolated sign clips."""

    def __init__(
        self,
        num_classes: int,
        pretrained: bool = True,
        hidden_size: int = 256,
        lstm_layers: int = 2,
        dropout: float = 0.3,
        temporal_pool: str = "last",
    ) -> None:
        super().__init__()

        weights = ResNet18_Weights.IMAGENET1K_V1 if pretrained else None
        backbone = resnet18(weights=weights)
        self.encoder = nn.Sequential(*list(backbone.children())[:-1])  # [B*T, 512, 1, 1]
        self.feature_dim = 512

        pool = temporal_pool.lower()
        if pool not in {"last", "mean", "max"}:
            raise ValueError("temporal_pool must be one of: last, mean, max")
        self.temporal_pool = pool

        self.temporal = nn.LSTM(
            input_size=self.feature_dim,
            hidden_size=hidden_size,
            num_layers=lstm_layers,
            batch_first=True,
            bidirectional=True,
            dropout=dropout if lstm_layers > 1 else 0.0,
        )

        self.classifier = nn.Sequential(
            nn.Linear(hidden_size * 2, hidden_size),
            nn.ReLU(inplace=True),
            nn.Dropout(p=dropout),
            nn.Linear(hidden_size, num_classes),
        )

    def forward(self, clip: torch.Tensor) -> torch.Tensor:
        """Args:
        clip: [B, T, C, H, W]
        """
        if clip.ndim != 5:
            raise ValueError("Expected clip tensor with shape [B, T, C, H, W]")

        batch_size, steps, channels, height, width = clip.shape
        frames = clip.view(batch_size * steps, channels, height, width)

        with torch.set_grad_enabled(self.training):
            frame_features = self.encoder(frames)

        frame_features = frame_features.view(batch_size, steps, self.feature_dim)

        temporal_features, _ = self.temporal(frame_features)

        if self.temporal_pool == "last":
            pooled = temporal_features[:, -1, :]
        elif self.temporal_pool == "mean":
            pooled = temporal_features.mean(dim=1)
        else:
            pooled = temporal_features.max(dim=1).values

        logits = self.classifier(pooled)
        return logits


ASLSignRecognizer = TemporalSignRecognizer
