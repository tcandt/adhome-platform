from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps


def read_rgb(path: Path) -> np.ndarray:
    with Image.open(path) as source:
        return np.asarray(ImageOps.exif_transpose(source).convert("RGB"))


def letterbox(image: np.ndarray, size: int) -> tuple[np.ndarray, float, int, int]:
    height, width = image.shape[:2]
    scale = min(size / width, size / height)
    resized = cv2.resize(image, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)
    canvas = np.full((size, size, 3), 127, dtype=np.uint8)
    left = (size - resized.shape[1]) // 2
    top = (size - resized.shape[0]) // 2
    canvas[top:top + resized.shape[0], left:left + resized.shape[1]] = resized
    return canvas, scale, left, top


def predict(session: ort.InferenceSession, image: np.ndarray, size: int) -> np.ndarray:
    canvas, scale, left, top = letterbox(image, size)
    tensor = canvas.transpose(2, 0, 1).astype(np.float32)[None] / 127.5 - 1.0
    output = session.run(["corners"], {"image": tensor})[0].reshape(4, 2)
    pixels = output * size - np.array([left, top], dtype=np.float32)
    pixels /= scale
    pixels[:, 0] = np.clip(pixels[:, 0], 0, image.shape[1] - 1)
    pixels[:, 1] = np.clip(pixels[:, 1], 0, image.shape[0] - 1)
    return pixels


def flatten(image: np.ndarray, points: np.ndarray) -> np.ndarray:
    horizontal = (np.linalg.norm(points[0] - points[1]) + np.linalg.norm(points[3] - points[2])) / 2
    vertical = (np.linalg.norm(points[0] - points[3]) + np.linalg.norm(points[1] - points[2])) / 2
    if vertical > horizontal:
        points = points[[3, 0, 1, 2]]
    target = np.array([[0, 0], [507, 0], [507, 319], [0, 319]], dtype=np.float32)
    matrix = cv2.getPerspectiveTransform(points.astype(np.float32), target)
    warped = cv2.warpPerspective(image, matrix, (508, 320), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    padding = 15
    return cv2.copyMakeBorder(warped, padding, padding, padding, padding, cv2.BORDER_CONSTANT, value=(255, 255, 255))


def fit(image: np.ndarray, width: int, height: int) -> np.ndarray:
    scale = min(width / image.shape[1], height / image.shape[0])
    resized = cv2.resize(image, (round(image.shape[1] * scale), round(image.shape[0] * scale)), interpolation=cv2.INTER_AREA)
    canvas = np.full((height, width, 3), 238, dtype=np.uint8)
    left = (width - resized.shape[1]) // 2
    top = (height - resized.shape[0]) // 2
    canvas[top:top + resized.shape[0], left:left + resized.shape[1]] = resized
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--groups", required=True)
    parser.add_argument("--annotations", type=Path, action="append", required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--size", type=int, default=224)
    args = parser.parse_args()
    annotations = {}
    for path in args.annotations:
        annotations.update(json.loads(path.read_text(encoding="utf-8")))
    session = ort.InferenceSession(str(args.model), providers=["CPUExecutionProvider"])
    results = []
    tiles = []
    for prefix, relative in json.loads(args.groups):
        files = sorted((args.root / relative).glob("*.jpg"), key=lambda path: int(path.name.split("-")[0]))
        for path in files:
            key = f"{prefix}{int(path.name.split('-')[0])}"
            if key not in annotations:
                continue
            image = read_rgb(path)
            points = predict(session, image, args.size)
            expected = np.asarray(annotations[key]["corners"], dtype=np.float32) * np.array([image.shape[1], image.shape[0]])
            normalized_error = np.linalg.norm((points - expected) / np.array([image.shape[1], image.shape[0]]), axis=1)
            annotated = image.copy()
            cv2.polylines(annotated, [np.round(points).astype(np.int32)], True, (255, 20, 20), max(3, round(max(image.shape[:2]) / 350)), cv2.LINE_AA)
            card = flatten(image, points)
            tile = np.full((280, 600, 3), 238, dtype=np.uint8)
            tile[24:274, :294] = fit(annotated, 294, 250)
            tile[24:274, 306:] = fit(card, 294, 250)
            cv2.putText(tile, f"{key} mean={normalized_error.mean():.3f} max={normalized_error.max():.3f}", (6, 18),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.48, (20, 20, 20), 1, cv2.LINE_AA)
            tiles.append(tile)
            results.append({"id": key, "mean": float(normalized_error.mean()), "max": float(normalized_error.max()),
                            "corners": (points / np.array([image.shape[1], image.shape[0]])).tolist()})
    columns = 3
    rows = (len(tiles) + columns - 1) // columns
    sheet = np.full((rows * 280, columns * 600, 3), 238, dtype=np.uint8)
    for index, tile in enumerate(tiles):
        row, column = divmod(index, columns)
        sheet[row * 280:(row + 1) * 280, column * 600:(column + 1) * 600] = tile
    args.output.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(args.output), cv2.cvtColor(sheet, cv2.COLOR_RGB2BGR))
    args.output.with_suffix(".json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"images={len(results)} mean={np.mean([item['mean'] for item in results]):.4f} "
          f"worst={max(item['max'] for item in results):.4f} output={args.output}")


if __name__ == "__main__":
    main()
