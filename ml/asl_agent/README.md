# ASLAgent v1 (Standalone, CPU-First)

This package adds a strong standalone ASL recognition stack in PyTorch with two models:

- `alphabet` (static signs): `ResNet18` classifier for A-Z handshapes.
- `isolated` (short clips): `ResNet18` frame encoder + 2-layer BiLSTM + MLP head (default temporal pooling: last frame, configurable to mean/max).

The setup is optimized for local desktop use first (CPU webcam inference), then can be extended later for federated workflows.

## Package Layout

- `asl_agent/models/static_cnn.py`: static sign model
- `asl_agent/models/temporal_lrcn.py`: clip model (`ASLSignRecognizer`)
- `asl_agent/data/alphabet_dataset.py`: folder-based image dataset
- `asl_agent/data/clip_dataset.py`: manifest and folder-driven clip datasets
- `asl_agent/agent.py`: app-facing inference wrapper (`ASLAgent`)
- `asl_agent/train.py`: train/eval CLI
- `asl_agent/infer_webcam.py`: realtime webcam loop
- `asl_agent/prepare_msasl_manifest.py`: helper for MS-ASL-like annotation JSON

## Environment

```bash
cd /Users/deafgod/Desktop/Codex/ml/asl_agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Data Formats

### 1) Alphabet images (A-Z)

Expected structure:

```text
alphabet_data/
  train/
    A/*.jpg
    B/*.jpg
    ...
  val/
    A/*.jpg
    B/*.jpg
    ...
```

### 2) Isolated sign clips (MS-ASL style)

Manifest CSV schema:

```text
path,label,split,signer_id
clips/0001.mp4,HELLO,train,23
clips/0034.mp4,THANK-YOU,val,98
```

`path` can be absolute or relative to `--clips-root`.

If you have an MS-ASL-like JSON annotations file:

```bash
python -m asl_agent.prepare_msasl_manifest \
  --input-json /path/to/annotations.json \
  --output-csv /path/to/msasl_manifest.csv
```

### 3) Isolated sign clips (folder layout)

Expected split/class/clip/frame structure:

```text
asl_video_data/
  train/
    A/
      clip_0001/frame_0001.jpg
      clip_0002/frame_0001.jpg
    HELLO/
      clip_0101/frame_0001.jpg
  val/
    A/
      clip_0400/frame_0001.jpg
    HELLO/
      clip_0415/frame_0001.jpg
```

## Training

### Alphabet model

```bash
python -m asl_agent.train \
  --task alphabet \
  --data-root /path/to/alphabet_data \
  --pretrained \
  --epochs 20 \
  --batch-size 32 \
  --device cpu \
  --checkpoint-dir /path/to/checkpoints
```

### Isolated sign model (clip)

Manifest source:

```bash
python -m asl_agent.train \
  --task isolated \
  --isolated-source manifest \
  --manifest-csv /path/to/msasl_manifest.csv \
  --clips-root /path/to/clips \
  --sequence-length 16 \
  --pretrained \
  --temporal-pool last \
  --epochs 30 \
  --batch-size 8 \
  --device cpu \
  --checkpoint-dir /path/to/checkpoints
```

Folder source:

```bash
python -m asl_agent.train \
  --task isolated \
  --isolated-source folder \
  --isolated-root /path/to/asl_video_data \
  --train-split train \
  --val-split val \
  --sequence-length 16 \
  --pretrained \
  --temporal-pool last \
  --epochs 30 \
  --batch-size 8 \
  --device cpu \
  --checkpoint-dir /path/to/checkpoints
```

## Evaluation

```bash
python -m asl_agent.train \
  --task isolated \
  --isolated-source manifest \
  --manifest-csv /path/to/msasl_manifest.csv \
  --clips-root /path/to/clips \
  --resume /path/to/checkpoints/isolated_best.pt \
  --eval-only \
  --device cpu
```

## Webcam Agent Runtime

Run local realtime predictions:

```bash
python -m asl_agent.infer_webcam \
  --checkpoint /path/to/checkpoints/isolated_best.pt \
  --model-type isolated \
  --sequence-length 16 \
  --top-k 3 \
  --device cpu
```

Press `q` to quit.

## One-shot Clip Utility

Capture one clip on SPACE and run a single prediction:

```bash
python -m asl_agent.tools.capture_clip \
  --checkpoint /path/to/checkpoints/isolated_best.pt \
  --model-type isolated \
  --sequence-length 16 \
  --camera-index 0 \
  --top-k 3 \
  --device cpu
```

Optional class override file (one label per line, same count/order as training):

```bash
python -m asl_agent.tools.capture_clip \
  --checkpoint /path/to/checkpoints/isolated_best.pt \
  --classes /path/to/class_names.txt \
  --sequence-length 16
```

## App Integration (`ASLAgent`)

```python
from asl_agent import ASLAgent

agent = ASLAgent(
    \"/path/to/checkpoints/isolated_best.pt\",
    model_type=\"isolated\",
    device=\"cpu\",
)

# clip_tensor: [T, C, H, W]
preds, probs = agent.predict_clip(clip_tensor, top_k=3)
print(preds[0].label, preds[0].confidence)
```

## Notes for Better Generalization

- Keep signer-independent splits (`signer_id` separation) for reliable real-world performance.
- Increase variation in training clips: background, lighting, skin tones, camera angles.
- Start with isolated vocabulary classes, then scale class count incrementally.
