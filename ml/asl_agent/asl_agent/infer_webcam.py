from __future__ import annotations

import argparse
import time
from collections import deque

import cv2
import numpy as np
import torch
from PIL import Image

from asl_agent.agent import ASLAgent
from asl_agent.data.transforms import build_eval_image_transform


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Realtime webcam inference for ASL models")
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--model-type", choices=["alphabet", "isolated"], default=None)
    parser.add_argument("--camera-index", type=int, default=0)
    parser.add_argument("--image-size", type=int, default=224)
    parser.add_argument("--sequence-length", type=int, default=16)
    parser.add_argument("--device", choices=["auto", "cpu", "cuda", "mps"], default="auto")
    parser.add_argument("--top-k", type=int, default=3)
    parser.add_argument("--smoothing", type=float, default=0.8)
    parser.add_argument("--min-confidence", type=float, default=0.25)
    parser.add_argument("--window-name", default="ASLAgent")
    return parser.parse_args()


def preprocess_frame(frame_bgr: np.ndarray, transform) -> torch.Tensor:
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)
    return transform(pil)


def draw_predictions(
    frame: np.ndarray,
    labels: list[str],
    probs: np.ndarray,
    top_k: int,
    min_confidence: float,
    fps: float,
) -> np.ndarray:
    output = frame.copy()
    _, w = output.shape[:2]

    cv2.rectangle(output, (0, 0), (w, 120), (0, 0, 0), thickness=-1)
    cv2.putText(
        output,
        f"FPS: {fps:.1f}",
        (12, 24),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )

    top_indices = np.argsort(-probs)[:top_k]
    y = 52
    for idx in top_indices:
        conf = float(probs[idx])
        if conf < min_confidence:
            continue
        text = f"{labels[idx]}: {conf:.2f}"
        cv2.putText(
            output,
            text,
            (12, y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2,
            cv2.LINE_AA,
        )
        y += 28

    if y == 52:
        cv2.putText(
            output,
            "No confident prediction",
            (12, y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (0, 180, 255),
            2,
            cv2.LINE_AA,
        )

    return output


def main() -> None:
    args = parse_args()
    agent = ASLAgent(
        args.checkpoint,
        model_type=args.model_type,
        device=args.device,
    )

    transform = build_eval_image_transform(args.image_size)

    cap = cv2.VideoCapture(args.camera_index)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open webcam index {args.camera_index}")

    frame_buffer: deque[torch.Tensor] = deque(maxlen=args.sequence_length)
    smoothed_probs: np.ndarray | None = None

    prev_t = time.perf_counter()
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            processed = preprocess_frame(frame, transform)

            if agent.model_type == "alphabet":
                _, probs_tensor = agent.predict_frame(processed, top_k=args.top_k)
            else:
                frame_buffer.append(processed)
                if len(frame_buffer) < args.sequence_length:
                    progress = f"Collecting frames {len(frame_buffer)}/{args.sequence_length}"
                    cv2.putText(
                        frame,
                        progress,
                        (12, 30),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.8,
                        (255, 255, 255),
                        2,
                        cv2.LINE_AA,
                    )
                    cv2.imshow(args.window_name, frame)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break
                    continue

                clip = torch.stack(list(frame_buffer), dim=0)
                _, probs_tensor = agent.predict_clip(clip, top_k=args.top_k)

            probs = probs_tensor.numpy()
            if smoothed_probs is None:
                smoothed_probs = probs
            else:
                alpha = float(np.clip(args.smoothing, 0.0, 0.99))
                smoothed_probs = alpha * smoothed_probs + (1.0 - alpha) * probs

            now = time.perf_counter()
            fps = 1.0 / max(now - prev_t, 1e-6)
            prev_t = now

            rendered = draw_predictions(
                frame,
                labels=agent.class_names,
                probs=smoothed_probs,
                top_k=args.top_k,
                min_confidence=args.min_confidence,
                fps=fps,
            )
            cv2.imshow(args.window_name, rendered)

            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
