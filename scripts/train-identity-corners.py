from __future__ import annotations

import argparse
import json
import math
import random
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
from torch import nn
from torch.utils.data import DataLoader, Dataset


@dataclass
class Sample:
    key: str
    image: np.ndarray
    corners: np.ndarray
    card: np.ndarray


def ordered(points: np.ndarray) -> np.ndarray:
    center = points.mean(axis=0)
    angles = np.arctan2(points[:, 1] - center[1], points[:, 0] - center[0])
    points = points[np.argsort(angles)]
    start = np.argmin(points[:, 0] + points[:, 1])
    return np.concatenate((points[start:], points[:start])).astype(np.float32)


def read_rgb(path: Path) -> np.ndarray:
    with Image.open(path) as source:
        return np.asarray(ImageOps.exif_transpose(source).convert("RGB"))


def extract_card(image: np.ndarray, normalized: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    points = normalized * np.array([width, height], dtype=np.float32)
    horizontal = (np.linalg.norm(points[0] - points[1]) + np.linalg.norm(points[3] - points[2])) / 2
    vertical = (np.linalg.norm(points[0] - points[3]) + np.linalg.norm(points[1] - points[2])) / 2
    if vertical > horizontal:
        points = points[[3, 0, 1, 2]]
    target = np.array([[0, 0], [507, 0], [507, 319], [0, 319]], dtype=np.float32)
    matrix = cv2.getPerspectiveTransform(points.astype(np.float32), target)
    return cv2.warpPerspective(image, matrix, (508, 320), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def load_samples(root: Path, groups: list[list[str]], annotations: dict) -> list[Sample]:
    samples: list[Sample] = []
    for prefix, relative in groups:
        folder = root / relative
        files = sorted(folder.glob("*.jpg"), key=lambda path: int(path.name.split("-")[0]))
        for path in files:
            key = f"{prefix}{int(path.name.split('-')[0])}"
            if key not in annotations:
                continue
            image = read_rgb(path)
            corners = np.asarray(annotations[key]["corners"], dtype=np.float32)
            samples.append(Sample(key, image, corners, extract_card(image, corners)))
    if not samples:
        raise RuntimeError("No annotated identity images were found.")
    return samples


def letterbox(image: np.ndarray, corners: np.ndarray, size: int) -> tuple[np.ndarray, np.ndarray]:
    height, width = image.shape[:2]
    scale = min(size / width, size / height)
    resized = cv2.resize(image, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)
    canvas = np.full((size, size, 3), 127, dtype=np.uint8)
    left = (size - resized.shape[1]) // 2
    top = (size - resized.shape[0]) // 2
    canvas[top:top + resized.shape[0], left:left + resized.shape[1]] = resized
    pixels = corners * np.array([width, height], dtype=np.float32)
    pixels = pixels * scale + np.array([left, top], dtype=np.float32)
    return canvas, pixels / size


def synthetic_background(samples: list[Sample], size: int) -> np.ndarray:
    source = random.choice(samples).image
    height, width = source.shape[:2]
    scale = max(size / width, size / height) * random.uniform(1.0, 1.8)
    resized = cv2.resize(source, (max(size, round(width * scale)), max(size, round(height * scale))), interpolation=cv2.INTER_AREA)
    x = random.randint(0, resized.shape[1] - size)
    y = random.randint(0, resized.shape[0] - size)
    background = resized[y:y + size, x:x + size].copy()
    if random.random() < 0.55:
        background = cv2.GaussianBlur(background, (0, 0), random.uniform(2, 8))
    if random.random() < 0.2:
        background[:] = np.random.randint(25, 235, (1, 1, 3), dtype=np.uint8)
    return background


def synthesize(samples: list[Sample], size: int) -> tuple[np.ndarray, np.ndarray]:
    background = synthetic_background(samples, size)
    card = random.choice(samples).card
    card_width = random.uniform(size * 0.28, size * 0.9)
    card_height = card_width / 1.586
    angle = random.uniform(-math.pi, math.pi)
    radius_x = abs(math.cos(angle)) * card_width / 2 + abs(math.sin(angle)) * card_height / 2
    radius_y = abs(math.sin(angle)) * card_width / 2 + abs(math.cos(angle)) * card_height / 2
    if radius_x > size * 0.48 or radius_y > size * 0.48:
        shrink = min(size * 0.48 / radius_x, size * 0.48 / radius_y)
        card_width *= shrink
        card_height *= shrink
        radius_x *= shrink
        radius_y *= shrink
    center = np.array([
        random.uniform(radius_x + 2, size - radius_x - 2),
        random.uniform(radius_y + 2, size - radius_y - 2),
    ], dtype=np.float32)
    local = np.array([[-card_width / 2, -card_height / 2], [card_width / 2, -card_height / 2],
                      [card_width / 2, card_height / 2], [-card_width / 2, card_height / 2]], dtype=np.float32)
    rotation = np.array([[math.cos(angle), -math.sin(angle)], [math.sin(angle), math.cos(angle)]], dtype=np.float32)
    destination = local @ rotation.T + center
    jitter = min(card_width, card_height) * random.uniform(0.0, 0.075)
    destination += np.random.uniform(-jitter, jitter, destination.shape).astype(np.float32)
    destination[:, 0] = np.clip(destination[:, 0], 1, size - 2)
    destination[:, 1] = np.clip(destination[:, 1], 1, size - 2)
    source = np.array([[0, 0], [card.shape[1] - 1, 0], [card.shape[1] - 1, card.shape[0] - 1], [0, card.shape[0] - 1]], dtype=np.float32)
    transform = cv2.getPerspectiveTransform(source, destination)
    warped = cv2.warpPerspective(card, transform, (size, size), flags=cv2.INTER_CUBIC)
    mask = cv2.warpPerspective(np.full(card.shape[:2], 255, dtype=np.uint8), transform, (size, size), flags=cv2.INTER_LINEAR)
    alpha = (mask.astype(np.float32) / 255.0)[..., None]
    image = (warped * alpha + background * (1 - alpha)).astype(np.uint8)
    points = ordered(destination) / size
    if random.random() < 0.28:
        edge = random.randrange(4)
        a, b = destination[edge], destination[(edge + 1) % 4]
        start, end = random.uniform(0.12, 0.4), random.uniform(0.6, 0.88)
        p = a + (b - a) * start
        q = a + (b - a) * end
        thickness = max(3, round(min(card_width, card_height) * random.uniform(0.05, 0.14)))
        color = tuple(int(value) for value in background[int(np.clip(p[1], 0, size - 1)), int(np.clip(p[0], 0, size - 1))])
        cv2.line(image, tuple(np.round(p).astype(int)), tuple(np.round(q).astype(int)), color, thickness, cv2.LINE_AA)
    return image, points


def photometric(image: np.ndarray) -> np.ndarray:
    pil = Image.fromarray(image)
    pil = ImageEnhance.Brightness(pil).enhance(random.uniform(0.55, 1.35))
    pil = ImageEnhance.Contrast(pil).enhance(random.uniform(0.65, 1.35))
    if random.random() < 0.3:
        pil = pil.filter(ImageFilter.GaussianBlur(random.uniform(0.2, 1.4)))
    image = np.asarray(pil).copy()
    if random.random() < 0.25:
        noise = np.random.normal(0, random.uniform(2, 9), image.shape)
        image = np.clip(image.astype(np.float32) + noise, 0, 255).astype(np.uint8)
    return image


class CornerDataset(Dataset):
    def __init__(self, samples: list[Sample], size: int, count: int, hard: set[str] | None = None):
        self.samples = samples
        self.size = size
        self.count = count
        self.hard = hard or set()

    def __len__(self) -> int:
        return self.count

    def __getitem__(self, _: int):
        use_real = random.random() < 0.28
        if use_real:
            pool = [sample for sample in self.samples if sample.key in self.hard] or self.samples
            sample = random.choice(pool if random.random() < 0.55 else self.samples)
            image, corners = letterbox(sample.image, sample.corners, self.size)
        else:
            image, corners = synthesize(self.samples, self.size)
        image = photometric(image)
        tensor = torch.from_numpy(image.transpose(2, 0, 1).astype(np.float32) / 127.5 - 1.0)
        return tensor, torch.from_numpy(corners.reshape(-1).astype(np.float32))


class DepthwiseBlock(nn.Module):
    def __init__(self, input_channels: int, output_channels: int, stride: int):
        super().__init__()
        self.layers = nn.Sequential(
            nn.Conv2d(input_channels, input_channels, 3, stride, 1, groups=input_channels, bias=False),
            nn.BatchNorm2d(input_channels), nn.SiLU(),
            nn.Conv2d(input_channels, output_channels, 1, bias=False),
            nn.BatchNorm2d(output_channels), nn.SiLU(),
        )

    def forward(self, value):
        return self.layers(value)


class CornerNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 16, 3, 2, 1, bias=False), nn.BatchNorm2d(16), nn.SiLU(),
            DepthwiseBlock(16, 24, 2), DepthwiseBlock(24, 32, 2),
            DepthwiseBlock(32, 48, 2), DepthwiseBlock(48, 64, 2),
            DepthwiseBlock(64, 96, 2), nn.AdaptiveAvgPool2d((7, 7)),
        )
        self.head = nn.Sequential(nn.Flatten(), nn.Linear(96 * 7 * 7, 256), nn.SiLU(), nn.Dropout(0.1), nn.Linear(256, 8), nn.Sigmoid())

    def forward(self, value):
        return self.head(self.features(value))


def image_tensor(sample: Sample, size: int) -> tuple[torch.Tensor, np.ndarray]:
    image, target = letterbox(sample.image, sample.corners, size)
    tensor = torch.from_numpy(image.transpose(2, 0, 1).astype(np.float32) / 127.5 - 1.0).unsqueeze(0)
    return tensor, target


def evaluate(model: nn.Module, samples: list[Sample], size: int) -> tuple[set[str], dict]:
    model.eval()
    hard: set[str] = set()
    report = {}
    with torch.no_grad():
        for sample in samples:
            tensor, target = image_tensor(sample, size)
            predicted = model(tensor).reshape(4, 2).cpu().numpy()
            errors = np.linalg.norm(predicted - target, axis=1)
            report[sample.key] = {"mean": float(errors.mean()), "max": float(errors.max())}
            if errors.max() > 0.035:
                hard.add(sample.key)
    return hard, report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--groups", required=True, help="JSON array of [prefix, relative folder]")
    parser.add_argument("--annotations", type=Path, action="append", required=True)
    parser.add_argument("--output", type=Path, default=Path("apps/console/public/models/identity-corners.onnx"))
    parser.add_argument("--size", type=int, default=224)
    parser.add_argument("--epochs", type=int, default=36)
    parser.add_argument("--samples-per-epoch", type=int, default=384)
    parser.add_argument("--checkpoint", type=Path, default=Path(".artifacts/identity-scan/identity-corners.checkpoint.pt"))
    parser.add_argument("--export-only", action="store_true")
    args = parser.parse_args()
    random.seed(42); np.random.seed(42); torch.manual_seed(42)
    annotations = {}
    for path in args.annotations:
        annotations.update(json.loads(path.read_text(encoding="utf-8")))
    samples = load_samples(args.root, json.loads(args.groups), annotations)
    model = CornerNet()
    if args.checkpoint.exists():
        checkpoint = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
        model.load_state_dict(checkpoint)
        print(f"resumed={args.checkpoint}", flush=True)
    optimizer = torch.optim.AdamW(model.parameters(), lr=2e-3, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    loss_function = nn.SmoothL1Loss(beta=0.025)
    hard: set[str] = set()
    for epoch in range(0 if args.export_only else args.epochs):
        model.train()
        dataset = CornerDataset(samples, args.size, args.samples_per_epoch, hard)
        loader = DataLoader(dataset, batch_size=16, shuffle=False, num_workers=0)
        total = 0.0
        for images, targets in loader:
            optimizer.zero_grad(set_to_none=True)
            prediction = model(images)
            loss = loss_function(prediction, targets)
            loss.backward()
            optimizer.step()
            total += float(loss.detach())
        scheduler.step()
        if epoch % 4 == 3 or epoch == args.epochs - 1:
            hard, report = evaluate(model, samples, args.size)
            worst = max(item["max"] for item in report.values())
            mean = sum(item["mean"] for item in report.values()) / len(report)
            args.checkpoint.parent.mkdir(parents=True, exist_ok=True)
            torch.save(model.state_dict(), args.checkpoint)
            print(f"epoch={epoch + 1} loss={total / len(loader):.5f} mean={mean:.4f} worst={worst:.4f} hard={len(hard)}", flush=True)
    hard, report = evaluate(model, samples, args.size)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    model.eval()
    torch.onnx.export(model, torch.zeros(1, 3, args.size, args.size), args.output,
                      input_names=["image"], output_names=["corners"], opset_version=18, dynamo=True)
    report_path = args.output.with_suffix(".report.json")
    report_path.write_text(json.dumps({"size": args.size, "samples": report, "hard": sorted(hard)}, indent=2), encoding="utf-8")
    print(f"exported={args.output} samples={len(samples)} hard={len(hard)} report={report_path}")


if __name__ == "__main__":
    main()
