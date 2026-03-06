from __future__ import annotations

import torch


@torch.no_grad()
def accuracy_at_k(logits: torch.Tensor, targets: torch.Tensor, topk: tuple[int, ...] = (1,)) -> list[torch.Tensor]:
    max_k = max(topk)
    _, pred = logits.topk(max_k, dim=1, largest=True, sorted=True)
    pred = pred.t()
    correct = pred.eq(targets.view(1, -1).expand_as(pred))

    res: list[torch.Tensor] = []
    batch_size = targets.shape[0]
    for k in topk:
        correct_k = correct[:k].reshape(-1).float().sum(0)
        res.append(correct_k.mul_(100.0 / batch_size))
    return res
