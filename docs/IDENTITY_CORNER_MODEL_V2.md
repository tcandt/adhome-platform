# CCCD Corner Model V2

Status: V2 release validated locally and on a Cloudflare version preview.

The 30 earlier images and 34 LK08-24/LK08-25 images were reviewed together.
There are 64 source images (59 distinct file hashes), containing 57 CCCD/can cuoc
examples and 7 non-CCCD negatives. One earlier driving-license image was corrected
from a positive to a negative. Three extra back-face crops from multi-face photos
bring the final training manifest to 67 samples. Raw images, labels, checkpoints,
the Python environment and detailed image reports remain in ignored directories.

## Model And Runtime

V2 uses torchvision's ImageNet-pretrained MobileNetV3-Small features, a four-corner
heatmap head and a separate document-presence head. Corners follow the upright
reading order TL, TR, BR, BL, including sideways and upside-down source images.
The final model is a self-contained ONNX file of approximately 4.2 MB.

Preprocessing matches local training: EXIF-normalized RGB, OpenCV INTER_AREA
letterbox to 320px, RGB 127 padding and float32 RGB CHW in [0, 1]. ImageNet mean/std
normalization is embedded in ONNX. Outputs are `heatmaps` [1,4,80,80] and
`presence` [1,1]. The browser decoder uses each channel's local 5x5 soft-argmax.

V2 proposals are not replaced by the previous contour/color candidate scorer.
Invalid or uncertain geometry, low document presence, diffuse corner heatmaps or
clipped edges require manual review. Load/inference errors produce a retryable
error instead of silently falling back to the old detector. Explicit crop
confirmation and verified private upload behavior remain in place.
Before cropping, the sampling quadrilateral is expanded in the card's perspective
plane by 8% of its shorter side (requested minimum 24 output pixels per side).
The extra area contains real source-image background, not a white canvas border.
Expansion is reduced when needed to stay inside the source image. The inner card
keeps ID-1 proportions; the whole image also includes the surrounding background.
The V1 implementation is retained with `modelVersion: 1` for comparisons.

Multi-face photos currently return one primary card in the application. Their
additional back faces are training samples, not a multi-object output contract.
Missing source pixels cannot be recovered by perspective correction.

## Verification And Limits

A grouped validation run used 58 images for training and held out 5 positive
images plus 1 passport. Exact duplicates and known same-document photographs were
kept in the same group. The validation model passed corner/orientation bounds on
5/5 positives and rejected the held-out passport. This set was used for checkpoint
selection and development, so it is not a blind external test.

The final model was then trained on all source data and the additional back faces.
Browser regression on the 64 original photos passed reviewed corner geometry and
reading orientation for 57/57 positive images, and accepted none of the 7 negative
images. All 285 rotated/dimmed/resized positive variants passed the orientation
and corner bound; edge-clipped variants may still require manual review.
Four unrelated rectangle controls were rejected. ONNX Runtime evaluation also
checks the three additional back-face crops.

Geometry bounds are mean corner distance <0.02 and max distance <0.04 in normalized
image coordinates. Orientation requires max semantic-corner distance <0.05.
These thresholds are regression tolerances, not pixel-perfect ground truth.
Annotations were reviewed visually and retain their own uncertainty.
Final-model source and variant scores are training-set regression, not evidence
of unseen-data accuracy. No OCR, identity authenticity or generalization rate is
claimed. A larger independently annotated test set is still needed.

Console typecheck/build, QR parser and Worker checks pass. Chrome UI checks use
a real local CCCD fixture at 1440/390/320px with reduced motion and mocked API
writes. They cover manual keyboard correction, stale preview invalidation,
confirmation/cancellation and upload retry/readback. Model-load failure/recovery
was checked separately without uploading source identity images.

## Reproduction

The full local manifest is `.training/identity-v2/manifest-with-extra-faces.json`.
It records file SHA256, reviewed corners, upright corner ordering and group split.
Training rejects fixture hash mismatches and groups crossing train/validation.

```powershell
$env:TORCH_HOME = Join-Path (Get-Location) '.training/torch-cache'
.training/venv-corners/Scripts/python.exe scripts/train-identity-corners-v2.py --manifest .training/identity-v2/manifest.json --output .training/identity-v2/holdout --epochs 40 --steps 24
.training/venv-corners/Scripts/python.exe scripts/train-identity-corners-v2.py --manifest .training/identity-v2/manifest.json --output .training/identity-v2/holdout-refined --resume .training/identity-v2/holdout/best.pt --epochs 32 --steps 24
.training/venv-corners/Scripts/python.exe scripts/train-identity-corners-v2.py --manifest .training/identity-v2/manifest.json --output .training/identity-v2/final-reviewed --resume .training/identity-v2/holdout-refined/best.pt --epochs 24 --steps 32 --all-data
.training/venv-corners/Scripts/python.exe scripts/train-identity-corners-v2.py --manifest .training/identity-v2/manifest-with-extra-faces.json --output .training/identity-v2/final-with-extra-faces --resume .training/identity-v2/final-reviewed/best.pt --epochs 12 --steps 24 --all-data
pnpm --filter @adhome/console build
$env:ADHOME_COMPARE_BASELINE = '1'
$env:ADHOME_CORNER_VARIANTS = '1'
node scripts/test-identity-corners-v2.mjs
```

The recorded training run used Python 3.13, PyTorch 2.10.0+cu128, torchvision
0.25.0+cu128, NumPy 2.5.1, OpenCV 5.0.0, ONNX 1.22.0 and ONNX Runtime 1.27.0.
The two intermediate training runs used evolving reviewed labels; the final
manifest is the authoritative corrected label set. Commands above show the
training stages, not a claim of bit-identical historical checkpoint reproduction.
The shipped ONNX checksum and aggregate metrics are in
`apps/console/public/models/identity-corners-v2.metadata.json`.

Open `.artifacts/identity-v2/report/index.html` for all 64 before/after image
comparisons, reviewed labels, model metadata, variant results and coordinate data.

## Release

The release build preserves the current Console workspace UI, as in the previous
production deployment. Unrelated local source changes remain outside this scoped
model commit. A separate snapshot containing only HEAD plus staged changes passed
Console typecheck and Vite build, confirming the commit builds independently.

Preview checks passed asset SHA256/MIME, actual ONNX V2 inference, missing-asset
404s, unauthenticated API 401, and mocked-upload UI checks at 1440/390/320px.
Source-padding tests verify real image pixels on all four margins, ID-1 card
mapping, invalid-corner rejection and source-frame expansion limits.

Previous production version: `1fa13aa7-9584-4567-be50-73fe7c5b004f`.

```powershell
npx wrangler versions deploy 1fa13aa7-9584-4567-be50-73fe7c5b004f@100% --config wrangler.console.jsonc --yes
```
