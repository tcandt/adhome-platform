# Trained CCCD corner detection

The scanner loads the 224px ONNX corner regressor and its external weights locally
in the browser. OpenCV INTER_AREA letterboxing and RGB normalization match training.
Learned corners and edge-refined proposals compete with contour proposals using the
same visible border/appearance evidence; a model proposal receives no score bonus.
Accepted corners are perspective-warped to ID-1 proportions with real white padding.
The user confirms the resulting JPEG before it enters the private upload queue.
Uncertain geometry remains available for manual review and correction.

Vite explicitly packages the ONNX WASM URL. The Worker serves binary model MIME
and rejects missing model/runtime requests with 404 instead of returning SPA HTML.
Model artifacts are marked binary in Git to preserve their exact bytes.

## Verification

- Console typecheck and production build passed, including a separate snapshot of
  the staged source. Existing HEAD references required address components, QR
  dependencies and DTO definitions that were missing from Git; these prerequisites
  are included so the scoped commit builds independently.
- ONNX inference verified on all 30 locally annotated training photos; 27 automatic
  crops met mean corner error below 0.025 and maximum error below 0.045 in normalized
  image coordinates. Three cases require manual review. Training-image performance
  is a regression check, not an independent generalization estimate.
- 13/15 rotated, dimmed and resized variants were automatic; every accepted variant
  met the annotated geometry bound. Four unrelated rectangle controls were rejected.
- Independent colored corner markers verified perspective mapping, white padding,
  ID-1 aspect ratio and crossed-corner rejection.
- Chrome UI passed at 1440, 390 and 320px with reduced motion: explicit confirmation,
  cancellation, keyboard correction, invalidated previews, scanner failure recovery,
  upload retry/readback and private dossier flows. API writes in UI tests are mocked.
- Cloudflare preview passed exact asset SHA256/MIME checks, actual ONNX inference,
  missing asset/model 404 checks and unauthenticated API 401 checks.

Raw identity photos and annotations remain in ignored local test directories.
No backend or database deployment is required for this model integration.
The deployed frontend is built from the existing workspace to preserve the current
Console UI; unrelated workspace edits remain outside this scoped commit.

## Commands

```powershell
pnpm --filter @adhome/console build
node scripts/test-identity-qr.mjs
node scripts/test-identity-trained-model.mjs
node scripts/test-identity-scan.mjs
node scripts/test-private-documents-ui.mjs
node apps/console/worker/index.test.mjs
node scripts/test-identity-scan-release.mjs
```

Browser source tests use `ADHOME_UI_URL=http://127.0.0.1:5190` and local fixtures
under `.training/identity-corners` (override with `ADHOME_MODEL_FIXTURES`).
The release check defaults to `https://console.adhome.vn` and compares with
`apps/console/dist`. Python training/evaluation helpers additionally require
PyTorch, OpenCV, Pillow, NumPy, ONNX/ONNX Script and ONNX Runtime as applicable.

Validated preview version: `1fa13aa7-9584-4567-be50-73fe7c5b004f`.
Previous production version: `25099629-bcbb-43f8-a6fe-33df97aecb9d`.

Rollback:

```powershell
npx wrangler versions deploy 25099629-bcbb-43f8-a6fe-33df97aecb9d@100% --config wrangler.console.jsonc --yes
```
