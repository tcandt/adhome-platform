import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { loadDocumentScanner, validScanCorners, type ScanCorners, type IdentityDocumentDetection } from './identityDocumentScan';

let model: Promise<{ ort: typeof import('onnxruntime-web/wasm'); session: import('onnxruntime-web/wasm').InferenceSession }> | undefined;

export async function detectIdentityCornersV2(source: HTMLCanvasElement, debug = false): Promise<IdentityDocumentDetection> {
  if (!model) model = (async () => {
    const ort = await import('onnxruntime-web/wasm');
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
    const session = await ort.InferenceSession.create('/models/identity-corners-v2.onnx', { executionProviders: ['wasm'] });
    return { ort, session };
  })().catch(error => { model = undefined; throw error; });
  let loaded: Awaited<NonNullable<typeof model>>;
  try { loaded = await model; }
  catch { throw new Error('Không tải được mô hình nhận diện CCCD. Kiểm tra kết nối rồi thử lại.'); }
  const { ort, session } = loaded, cv = await loadDocumentScanner();
  const size = 320, heatSize = 80, scale = Math.min(size / source.width, size / source.height);
  const width = Math.round(source.width * scale), height = Math.round(source.height * scale);
  const left = Math.floor((size - width) / 2), top = Math.floor((size - height) / 2);
  const data = new Float32Array(3 * size * size); data.fill(127 / 255);
  const input = cv.imread(source), resized = new cv.Mat();
  try {
    cv.resize(input, resized, new cv.Size(width, height), 0, 0, cv.INTER_AREA);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < 3; c++) {
      data[c * size * size + (y + top) * size + x + left] = resized.data[(y * width + x) * 4 + c] / 255;
    }
  } finally { input.delete(); resized.delete(); }
  const tensor = new ort.Tensor('float32', data, [1, 3, size, size]);
  let outputs: Awaited<ReturnType<typeof session.run>>;
  try { outputs = await session.run({ image: tensor }); }
  catch { tensor.dispose(); throw new Error('Không xử lý được ảnh CCCD. Hãy thử lại hoặc chỉnh góc thủ công.'); }
  try {
    const values = outputs.heatmaps.data as Float32Array;
    const presence = 1 / (1 + Math.exp(-Number(outputs.presence.data[0])));
    const masses: number[] = [];
    const raw = Array.from({ length: 4 }, (_, corner) => {
      const channel = values.subarray(corner * heatSize * heatSize, (corner + 1) * heatSize * heatSize);
      let best = 0;
      for (let i = 1; i < channel.length; i++) if (channel[i] > channel[best]) best = i;
      const px = best % heatSize, py = Math.floor(best / heatSize), peak = channel[best];
      let total = 0, local = 0, x = 0, y = 0;
      for (let i = 0; i < channel.length; i++) total += Math.exp(channel[i] - peak);
      for (let row = Math.max(0, py - 2); row <= Math.min(heatSize - 1, py + 2); row++) {
        for (let col = Math.max(0, px - 2); col <= Math.min(heatSize - 1, px + 2); col++) {
          const weight = Math.exp(channel[row * heatSize + col] - peak);
          local += weight; x += weight * (col + 0.5); y += weight * (row + 0.5);
        }
      }
      masses.push(local / total);
      return { x: (x / local / heatSize * size - left) / (source.width * scale), y: (y / local / heatSize * size - top) / (source.height * scale) };
    }) as ScanCorners;
    const inBounds = raw.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= -0.02 && p.y >= -0.02 && p.x <= 1.02 && p.y <= 1.02);
    const corners = raw.map(p => ({ x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) })) as ScanCorners;
    const valid = inBounds && validScanCorners(corners);
    const clipped = raw.some((p, i) => {
      const q = raw[(i + 1) % 4];
      return (p.x < 0.015 && q.x < 0.015) || (p.y < 0.015 && q.y < 0.015)
        || (p.x > 0.985 && q.x > 0.985) || (p.y > 0.985 && q.y > 0.985);
    });
    const automatic = valid && !clipped && presence >= 0.9 && masses.every(mass => mass >= 0.4);
    return { corners: valid && presence >= 0.5 ? corners : null, automatic, confidence: Math.min(presence, ...masses), rotation: 0,
      ...(debug ? { debug: { modelVersion: 2, modelPredicted: true, modelCorners: raw, presence, clipped, cornerMass: masses, candidates: valid ? [{ points: corners, method: 'semantic-heatmaps-v2' }] : [] } } : {}) };
  } finally { tensor.dispose(); Object.values(outputs).forEach(output => output.dispose()); }
}
