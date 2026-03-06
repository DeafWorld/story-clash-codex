from __future__ import annotations

import argparse

import cv2
import torch
from PIL import Image

from asl_agent import ASLAgent
from asl_agent.data.transforms import build_eval_image_transform


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Capture one webcam clip and run ASL prediction")
    parser.add_argument("--checkpoint", required=True, help="Path to ASLAgent checkpoint (.pt)")
    parser.add_argument(
        "--classes",
        default=None,
        help="Optional class names file (one label per line). Must match checkpoint class count.",
    )
    parser.add_argument("--model-type", choices=["isolated", "alphabet"], default="isolated")
    parser.add_argument("--sequence-length", type=int, default=16)
    parser.add_argument("--camera-index", type=int, default=0)
    parser.add_argument("--image-size", type=int, default=224)
    parser.add_argument("--top-k", type=int, default=3)
    parser.add_argument("--device", choices=["auto", "cpu", "cuda", "mps"], default="auto")
    parser.add_argument("--window-name", default="ASL Capture")
    return parser.parse_args()


def _load_class_names(path: str) -> list[str]:
    with open(path, encoding="utf-8") as handle:
        names = [line.strip() for line in handle if line.strip()]
    if not names:
        raise ValueError(f"No class labels found in {path}")
    return names


def _preprocess_frame(frame_bgr, transform) -> torch.Tensor:
    frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    pil_image = Image.fromarray(frame_rgb)
    return transform(pil_image)


def capture_clip_from_webcam(
    *,
    sequence_length: int,
    camera_index: int,
    image_size: int,
    window_name: str,
) -> torch.Tensor | None:
    if sequence_length < 2:
        raise ValueError("sequence_length must be >= 2")

    transform = build_eval_image_transform(image_size)

    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open webcam index {camera_index}")

    frames: list[torch.Tensor] = []

    print(f"Press SPACE to capture {sequence_length} frames, ESC to quit.")

    try:
        while True:
            ok, frame_bgr = cap.read()
            if not ok:
                break

            preview = frame_bgr.copy()
            cv2.putText(
                preview,
                f"SPACE: capture {sequence_length} | ESC: quit",
                (12, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255, 255, 255),
                2,
                cv2.LINE_AA,
            )
            cv2.imshow(window_name, preview)

            key = cv2.waitKey(1) & 0xFF
            if key == 27:  # ESC
                return None

            if key == 32:  # SPACE
                frames.clear()
                for step in range(sequence_length):
                    ok, frame_bgr = cap.read()
                    if not ok:
                        break

                    frames.append(_preprocess_frame(frame_bgr, transform))

                    progress = frame_bgr.copy()
                    cv2.putText(
                        progress,
                        f"Capturing {step + 1}/{sequence_length}",
                        (12, 30),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.8,
                        (0, 255, 0),
                        2,
                        cv2.LINE_AA,
                    )
                    cv2.imshow(window_name, progress)
                    cv2.waitKey(1)
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()

    if not frames:
        return None

    while len(frames) < sequence_length:
        frames.append(frames[-1].clone())

    return torch.stack(frames[:sequence_length], dim=0)


def main() -> None:
    args = parse_args()

    agent = ASLAgent(
        checkpoint_path=args.checkpoint,
        model_type=args.model_type,
        device=args.device,
    )

    if args.classes:
        class_names = _load_class_names(args.classes)
        if len(class_names) != len(agent.class_names):
            raise ValueError(
                "Class count mismatch: "
                f"classes file has {len(class_names)}, checkpoint has {len(agent.class_names)}"
            )
        agent.class_names = class_names

    clip = capture_clip_from_webcam(
        sequence_length=args.sequence_length,
        camera_index=args.camera_index,
        image_size=args.image_size,
        window_name=args.window_name,
    )
    if clip is None:
        print("No clip captured.")
        return

    predictions, _ = agent.predict_clip(clip, top_k=args.top_k)
    if not predictions:
        print("No predictions returned.")
        return

    print("Top predictions:")
    for rank, pred in enumerate(predictions, start=1):
        print(f"{rank}. {pred.label} (p={pred.confidence:.3f})")


if __name__ == "__main__":
    main()
