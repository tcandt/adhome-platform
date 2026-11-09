import opencvUrl from '@techstark/opencv-js/dist/opencv.js?url';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

export type ScanPoint = { x: number; y: number };
export type ScanCorners = [ScanPoint, ScanPoint, ScanPoint, ScanPoint];
let runtime: Promise<any> | undefined;
let cornerModel: Promise<any> | undefined;
export function loadDocumentScanner(): Promise<any> {
  if (!runtime) runtime = new Promise<any>((resolve, reject) => {
    const existing = (window as any).cv;
    if (existing) { Promise.resolve(existing).then(resolve, reject); return; }
    const script = document.createElement('script'); script.src = opencvUrl; script.async = true;
    script.onload = () => Promise.resolve((window as any).cv).then(cv => cv?.Mat ? resolve(cv) : reject(new Error('Không khởi tạo được bộ quét.')), reject);
    script.onerror = () => { script.remove(); reject(new Error('Không tải được bộ nhận diện góc. Kiểm tra kết nối rồi thử lại.')); };
    document.head.appendChild(script);
  }).catch(error => { runtime = undefined; delete (window as any).cv; throw error; });
  return runtime;
}
const cross = (a: ScanPoint, b: ScanPoint, c: ScanPoint) => (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
export function validScanCorners(points: ScanCorners) {
  const turns = points.map((p, i) => cross(p, points[(i + 1) % 4], points[(i + 2) % 4]));
  const area = Math.abs(points.reduce((sum, p, i) => sum + p.x * points[(i + 1) % 4].y - p.y * points[(i + 1) % 4].x, 0)) / 2;
  return turns.every(n => n > 0.0001) && area > 0.01 && points.every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
}
type CardCandidate = { points: ScanCorners; score: number; area: number; ratio: number; color: number; edge: number; texture: number; rotation: number; method: string };
export type IdentityDocumentDetection = { corners: ScanCorners | null; confidence: number; automatic: boolean; rotation: number; debug?: unknown };
const distance = (a: ScanPoint, b: ScanPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const polygonArea = (points: ScanPoint[]) => Math.abs(points.reduce((n, p, i) => n + p.x * points[(i + 1) % points.length].y - p.y * points[(i + 1) % points.length].x, 0)) / 2;
const orderedCorners = (points: ScanPoint[]): ScanCorners => {
  const center = { x: points.reduce((n, p) => n + p.x, 0) / 4, y: points.reduce((n, p) => n + p.y, 0) / 4 };
  points.sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
  const start = points.reduce((index, p, j) => p.x + p.y < points[index].x + points[index].y ? j : index, 0);
  return [...points.slice(start), ...points.slice(0, start)] as ScanCorners;
};
const intersection = (a: ScanPoint, b: ScanPoint, c: ScanPoint, d: ScanPoint) => {
  const divisor = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(divisor) < 1e-6) return null;
  const u = a.x * b.y - a.y * b.x, v = c.x * d.y - c.y * d.x;
  return { x: (u * (c.x - d.x) - (a.x - b.x) * v) / divisor, y: (u * (c.y - d.y) - (a.y - b.y) * v) / divisor };
};

async function predictIdentityCorners(source: HTMLCanvasElement): Promise<ScanCorners | null> {
  try {
    if (!cornerModel) cornerModel = (async () => {
      const ort = await import('onnxruntime-web/wasm');
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
      return { ort, session: await ort.InferenceSession.create('/models/identity-corners.onnx', {
        executionProviders: ['wasm'],
        externalData: [{ path: 'identity-corners.onnx.data', data: '/models/identity-corners.onnx.data' }],
      }) };
    })().catch(error => { cornerModel = undefined; throw error; });
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const { ort, session } = await cornerModel;
    const size = 224, scale = Math.min(size / source.width, size / source.height);
    const width = Math.round(source.width * scale), height = Math.round(source.height * scale);
    const left = Math.floor((size - width) / 2), top = Math.floor((size - height) / 2);
    const input = new Float32Array(3 * size * size); input.fill(127 / 127.5 - 1);
    const cv = await loadDocumentScanner(), original = cv.imread(source), resized = new cv.Mat();
    try {
      // Match training's INTER_AREA downsampling; canvas interpolation changes model predictions.
      cv.resize(original, resized, new cv.Size(width, height), 0, 0, cv.INTER_AREA);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let channel = 0; channel < 3; channel++) {
        input[channel * size * size + (y + top) * size + x + left] = resized.data[(y * width + x) * 4 + channel] / 127.5 - 1;
      }
    } finally { original.delete(); resized.delete(); }
    const output = await session.run({ image: new ort.Tensor('float32', input, [1, 3, size, size]) });
    const values = output.corners.data as Float32Array;
    const points = Array.from({ length: 4 }, (_, i) => ({
      x: Math.min(1, Math.max(0, (values[i * 2] * size - left) / (source.width * scale))),
      y: Math.min(1, Math.max(0, (values[i * 2 + 1] * size - top) / (source.height * scale))),
    })) as ScanCorners;
    return validScanCorners(points) ? points : null;
  } catch { return null; }
}

function snapModelEdges(cv: any, edges: any, points: ScanCorners, width: number, height: number): ScanCorners {
  const pixels = points.map(point => ({ x: point.x * width, y: point.y * height })) as ScanCorners;
  const lines: Array<[ScanPoint, ScanPoint]> = [];
  for (let edge = 0; edge < 4; edge++) {
    const a = pixels[edge], b = pixels[(edge + 1) % 4], length = distance(a, b);
    const nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length;
    const search = Math.max(6, Math.min(28, Math.round(length * 0.075)));
    let bestOffset = 0, bestScore = -1;
    for (let offset = -search; offset <= search; offset++) {
      let score = 0;
      for (let t = 0.08; t <= 0.92; t += 0.018) {
        const x = Math.round(a.x + (b.x - a.x) * t + nx * offset), y = Math.round(a.y + (b.y - a.y) * t + ny * offset);
        if (x >= 0 && x < width && y >= 0 && y < height && edges.ucharPtr(y, x)[0]) score++;
      }
      score -= Math.abs(offset) * 0.12;
      if (score > bestScore) { bestScore = score; bestOffset = offset; }
    }
    lines.push([{ x: a.x + nx * bestOffset, y: a.y + ny * bestOffset }, { x: b.x + nx * bestOffset, y: b.y + ny * bestOffset }]);
  }
  const snapped = lines.map((line, i) => intersection(lines[(i + 3) % 4][0], lines[(i + 3) % 4][1], line[0], line[1]) || pixels[i]) as ScanCorners;
  const normalized = snapped.map(point => ({ x: point.x / width, y: point.y / height })) as ScanCorners;
  return validScanCorners(normalized) && normalized.every((point, i) => distance(point, points[i]) < 0.08) ? normalized : points;
}

// Fit the straight middle of each edge, then intersect lines to recover rounded card corners.
function refineCardEdges(cv: any, contour: any, points: ScanCorners): ScanCorners {
  const lines: Array<[ScanPoint, ScanPoint]> = [];
  for (let edge = 0; edge < 4; edge++) {
    const a = points[edge], b = points[(edge + 1) % 4], length = distance(a, b), samples: number[] = [];
    for (let i = 0; i < contour.data32S.length; i += 2) {
      const x = contour.data32S[i], y = contour.data32S[i + 1];
      const t = ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / (length * length);
      const perpendicular = Math.abs((x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x)) / length;
      if (t > 0.12 && t < 0.88 && perpendicular < length * 0.035) samples.push(x, y);
    }
    if (samples.length < 10) { lines.push([a, b]); continue; }
    const mat = cv.matFromArray(samples.length / 2, 1, cv.CV_32FC2, samples), line = new cv.Mat();
    try {
      cv.fitLine(mat, line, cv.DIST_HUBER, 0, 0.01, 0.01);
      const [vx, vy, x, y] = line.data32F;
      lines.push([{ x, y }, { x: x + vx * length, y: y + vy * length }]);
    } finally { mat.delete(); line.delete(); }
  }
  const refined = points.map((p, i) => {
    const previous = lines[(i + 3) % 4], next = lines[i];
    const found = intersection(previous[0], previous[1], next[0], next[1]);
    return found && distance(found, p) < Math.min(distance(p, points[(i + 1) % 4]), distance(p, points[(i + 3) % 4])) * 0.12 ? found : p;
  }) as ScanCorners;
  return refined;
}

export async function detectIdentityDocument(source: HTMLCanvasElement, options: { debug?: boolean; modelVersion?: 1 | 2 } = {}): Promise<IdentityDocumentDetection> {
  if (options.modelVersion !== 1) {
    const { detectIdentityCornersV2 } = await import('./identityCornerModelV2');
    return detectIdentityCornersV2(source, options.debug);
  }
  const cv = await loadDocumentScanner();
  const canvas = document.createElement('canvas'); const scale = Math.min(1, 1100 / Math.max(source.width, source.height));
  canvas.width = Math.round(source.width * scale); canvas.height = Math.round(source.height * scale);
  canvas.getContext('2d', { willReadFrequently: true })!.drawImage(source, 0, 0, canvas.width, canvas.height);
  const width = canvas.width, height = canvas.height, totalArea = width * height;
  const input = cv.imread(canvas), gray = new cv.Mat(), rgb = new cv.Mat(), hsv = new cv.Mat(), edges = new cv.Mat(), mask = new cv.Mat();
  const contours = new cv.MatVector(), hierarchy = new cv.Mat();
  const candidates: CardCandidate[] = [];
  try {
    cv.cvtColor(input, gray, cv.COLOR_RGBA2GRAY); cv.cvtColor(input, rgb, cv.COLOR_RGBA2RGB); cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
    cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0);
    cv.Canny(gray, edges, 18, 54);
    const sample = (data: Uint8Array, x: number, y: number, channels = 1, channel = 0) => data[(Math.max(0, Math.min(height - 1, Math.round(y))) * width + Math.max(0, Math.min(width - 1, Math.round(x)))) * channels + channel];
    const scoreCandidate = (points: ScanCorners, method: string) => {
      const normalized = points.map(p => ({ x: p.x / width, y: p.y / height })) as ScanCorners;
      if (!validScanCorners(normalized)) return;
      const area = polygonArea(points) / totalArea;
      if (area < 0.045 || area > 0.96) return;
      const horizontal = (distance(points[0], points[1]) + distance(points[3], points[2])) / 2;
      const vertical = (distance(points[0], points[3]) + distance(points[1], points[2])) / 2;
      if (Math.min(distance(points[0], points[1]), distance(points[3], points[2])) / Math.max(distance(points[0], points[1]), distance(points[3], points[2])) < 0.6
        || Math.min(distance(points[0], points[3]), distance(points[1], points[2])) / Math.max(distance(points[0], points[3]), distance(points[1], points[2])) < 0.6) return;
      const ratio = Math.max(horizontal, vertical) / Math.min(horizontal, vertical);
      if (ratio < 1.2 || ratio > 2.08) return;
      const nearFrame = normalized.filter(p => (p.x < 0.015 || p.x > 0.985) && (p.y < 0.015 || p.y > 0.985)).length;
      if (nearFrame >= 3) return;
      // Geometry alone is enough to orient an ID-1 card. QR decoding belongs to
      // tenant data entry and must not delay or gate document cropping.
      const rotation = horizontal >= vertical ? 0 : 1;
      let color = 0, texture = 0, edgeSupport = 0, contrast = 0, samples = 0;
      for (let v = 0.06; v < 0.95; v += 0.07) for (let u = 0.04; u < 0.98; u += 0.055) {
        const x = (1 - v) * ((1 - u) * points[0].x + u * points[1].x) + v * ((1 - u) * points[3].x + u * points[2].x);
        const y = (1 - v) * ((1 - u) * points[0].y + u * points[1].y) + v * ((1 - u) * points[3].y + u * points[2].y);
        const h = sample(hsv.data, x, y, 3), s = sample(hsv.data, x, y, 3, 1), value = sample(hsv.data, x, y, 3, 2);
        if (h >= 32 && h <= 115 && s > 20 && value > 75) color++;
        if (sample(edges.data, x, y) > 0) texture++;
        samples++;
      }
      color /= samples; texture /= samples;
      for (let edge = 0; edge < 4; edge++) {
        const a = points[edge], b = points[(edge + 1) % 4], length = distance(a, b);
        const nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length;
        for (let t = 0.12; t <= 0.89; t += 0.035) {
          const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
          let found = false;
          for (let offset = -4; offset <= 4; offset++) if (sample(edges.data, x + nx * offset, y + ny * offset)) { found = true; break; }
          edgeSupport += found ? 1 : 0;
          contrast += Math.min(1, Math.abs(sample(gray.data, x + nx * 6, y + ny * 6) - sample(gray.data, x - nx * 6, y - ny * 6)) / 65);
        }
      }
      edgeSupport /= 92; contrast /= 92;
      const ratioScore = Math.exp(-Math.abs(Math.log(ratio / 1.586)) * 3);
      const appearance = 0.25 * ratioScore + 0.24 * Math.min(1, edgeSupport) + 0.18 * Math.min(1, color / 0.3)
        + 0.13 * Math.min(1, contrast) + 0.14 * Math.sqrt(area) + 0.06 * Math.min(1, texture / 0.05);
      // Score learned proposals by the same visible evidence as contour proposals.
      const score = appearance;
      candidates.push({ points: normalized, score, area, ratio, color, edge: edgeSupport, texture, rotation, method });
    };
    const aiCorners = await predictIdentityCorners(source);
    if (aiCorners) {
      const snapped = snapModelEdges(cv, edges, aiCorners, width, height);
      scoreCandidate(snapped.map(point => ({ x: point.x * width, y: point.y * height })) as ScanCorners, 'ai-refined');
      scoreCandidate(aiCorners.map(point => ({ x: point.x * width, y: point.y * height })) as ScanCorners, 'ai');
    }
    const gather = (binary: any, method: string) => {
      cv.findContours(binary, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i), hull = new cv.Mat(), approx = new cv.Mat();
        try {
          if (cv.contourArea(contour) < totalArea * 0.04) continue;
          cv.convexHull(contour, hull);
          const perimeter = cv.arcLength(hull, true);
          for (const epsilon of [0.015, 0.025, 0.04, 0.06]) {
            cv.approxPolyDP(hull, approx, perimeter * epsilon, true);
            if (approx.rows !== 4) continue;
            const points = orderedCorners(Array.from({ length: 4 }, (_, j) => ({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] })));
            scoreCandidate(refineCardEdges(cv, contour, points), method);
            break;
          }
          const rect = cv.minAreaRect(contour);
          const angle = rect.angle * Math.PI / 180, dx = Math.cos(angle), dy = Math.sin(angle);
          const points = orderedCorners([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => ({
            x: rect.center.x + x * rect.size.width / 2 * dx - y * rect.size.height / 2 * dy,
            y: rect.center.y + x * rect.size.width / 2 * dy + y * rect.size.height / 2 * dx,
          })));
          scoreCandidate(points, `${method}-rect`);
        } finally { contour.delete(); hull.delete(); approx.delete(); }
      }
    };
    for (const threshold of [20, 50, 90]) {
      cv.Canny(gray, mask, threshold, threshold * 3);
      for (const kernelSize of [3, 9]) {
        const closed = new cv.Mat(), kernel = cv.Mat.ones(kernelSize, kernelSize, cv.CV_8U);
        try { cv.morphologyEx(mask, closed, cv.MORPH_CLOSE, kernel); gather(closed, `edge-${threshold}-${kernelSize}`); }
        finally { closed.delete(); kernel.delete(); }
      }
    }
    const low = new cv.Mat(height, width, hsv.type(), new cv.Scalar(30, 20, 65, 0));
    const high = new cv.Mat(height, width, hsv.type(), new cv.Scalar(115, 255, 255, 255));
    try {
      cv.inRange(hsv, low, high, mask);
      for (const size of [9, 21, 37]) {
        const closed = new cv.Mat(), kernel = cv.Mat.ones(size, size, cv.CV_8U);
        try { cv.morphologyEx(mask, closed, cv.MORPH_CLOSE, kernel); gather(closed, `color-${size}`); }
        finally { closed.delete(); kernel.delete(); }
      }
    } finally { low.delete(); high.delete(); }
    for (const threshold of [110, 155, 195]) {
      cv.threshold(gray, mask, threshold, 255, cv.THRESH_BINARY); gather(mask, `light-${threshold}`);
    }
    // Intersect independent border segments when a hand or patterned background joins the contour.
    const hough = new cv.Mat();
    const borderLines: Array<{ a: ScanPoint; b: ScanPoint; length: number; angle: number }> = [];
    try {
      cv.HoughLinesP(edges, hough, 1, Math.PI / 360, 40, Math.min(width, height) * 0.16, 20);
      const lines: Array<{ a: ScanPoint; b: ScanPoint; length: number; angle: number }> = [];
      for (let i = 0; i < hough.data32S.length; i += 4) {
        const a = { x: hough.data32S[i], y: hough.data32S[i + 1] }, b = { x: hough.data32S[i + 2], y: hough.data32S[i + 3] };
        const angle = (Math.atan2(b.y - a.y, b.x - a.x) + Math.PI) % Math.PI;
        lines.push({ a, b, length: distance(a, b), angle });
      }
      lines.sort((a, b) => b.length - a.length);
      const unique: typeof lines = [];
      const angleDistance = (a: number, b: number) => Math.min(Math.abs(a - b), Math.PI - Math.abs(a - b));
      for (const line of lines) {
        if (unique.some(other => angleDistance(line.angle, other.angle) < 0.035 && Math.abs(cross(other.a, other.b, line.a)) / other.length < 8)) continue;
        unique.push(line); if (unique.length >= 70) break;
      }
      borderLines.push(...unique);
      const pairs: Array<{ a: typeof lines[number]; b: typeof lines[number]; weight: number }> = [];
      for (let i = 0; i < unique.length; i++) for (let j = i + 1; j < unique.length; j++) {
        const a = unique[i], b = unique[j];
        const separation = Math.abs(cross(a.a, a.b, b.a)) / a.length;
        if (angleDistance(a.angle, b.angle) > 0.25 || separation < Math.min(width, height) * 0.13) continue;
        pairs.push({ a, b, weight: a.length + b.length });
      }
      pairs.sort((a, b) => b.weight - a.weight);
      const directionCounts = new Map<number, number>();
      const selected = pairs.filter(pair => {
        const direction = Math.floor(pair.a.angle / Math.PI * 12), count = directionCounts.get(direction) || 0;
        directionCounts.set(direction, count + 1); return count < 35;
      });
      for (let i = 0; i < selected.length; i++) for (let j = i + 1; j < selected.length; j++) {
        const a = selected[i], b = selected[j];
        if (angleDistance(a.a.angle, b.a.angle) < 1.08) continue;
        const points = [intersection(a.a.a, a.a.b, b.a.a, b.a.b), intersection(a.a.a, a.a.b, b.b.a, b.b.b),
          intersection(a.b.a, a.b.b, b.b.a, b.b.b), intersection(a.b.a, a.b.b, b.a.a, b.a.b)];
        if (points.some(p => !p || p.x < 0 || p.y < 0 || p.x >= width || p.y >= height)) continue;
        scoreCandidate(orderedCorners(points as ScanPoint[]), 'border-lines');
      }
    } finally { hough.delete(); }
    const seeds = candidates.filter(c => c.method.startsWith('color-') && c.score > 0.62).sort((a, b) => b.score - a.score).slice(0, 12);
    for (const seed of seeds) for (let edge = 0; edge < 4; edge++) {
      const a = { x: seed.points[edge].x * width, y: seed.points[edge].y * height };
      const b = { x: seed.points[(edge + 1) % 4].x * width, y: seed.points[(edge + 1) % 4].y * height };
      const length = distance(a, b), nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length;
      for (const factor of [1.586, 1 / 1.586]) for (const direction of [-1, 1]) {
        const depth = length * factor * direction;
        const rect = orderedCorners([a, b, { x: b.x + nx * depth, y: b.y + ny * depth }, { x: a.x + nx * depth, y: a.y + ny * depth }]);
        const fitted = rect.map((p, i) => {
          const q = rect[(i + 1) % 4], length = distance(p, q), midpoint = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
          const angle = (Math.atan2(q.y - p.y, q.x - p.x) + Math.PI) % Math.PI;
          const nearby = borderLines.map(line => ({ line, separation: Math.abs(cross(line.a, line.b, midpoint)) / line.length }))
            .filter(({ line, separation }) => Math.min(Math.abs(line.angle - angle), Math.PI - Math.abs(line.angle - angle)) < 0.16
              && separation < Math.min(length, Math.abs(depth)) * 0.11 && line.length > length * 0.32)
            .sort((a, b) => a.separation - b.separation);
          return nearby[0]?.line || { a: p, b: q };
        });
        const snapped = fitted.map((line, i) => {
          const previous = fitted[(i + 3) % 4]; return intersection(previous.a, previous.b, line.a, line.b) || rect[i];
        }) as ScanCorners;
        scoreCandidate(snapped, 'border-recovery');
      }
    }
    // An internal portrait/text block can have stronger color and edges than the
    // card itself. Demote it when a plausible outer ID-1 outline contains it.
    for (const candidate of candidates) {
      if (candidates.some(outer => outer.area > candidate.area * 1.35 && outer.area < candidate.area * 4
        && outer.score > candidate.score - 0.12 && outer.edge > 0.82 && outer.color > 0.06
        && Math.abs(Math.log(outer.ratio / 1.586)) < 0.16
        && candidate.points.every(p => outer.points.every((a, i) => cross(a, outer.points[(i + 1) % 4], p) > -0.002)))) candidate.score -= 0.15;
    }
    candidates.sort((a, b) => b.score - a.score);
    const primary = candidates.filter(c => c.area >= 0.16 && c.texture >= 0.018 && c.color >= 0.05);
    const compact = candidates.filter(c => c.area >= 0.08 && c.texture >= 0.018 && c.color >= 0.05
      && c.edge >= 0.9 && c.score >= 0.7);
    const eligible = primary.length ? primary : compact;
    const peak = eligible[0];
    // Hands and patterned surfaces can produce an inner quadrilateral with a
    // marginally higher edge score. Prefer the larger supported outline when
    // its confidence is effectively tied with the peak candidate.
    const best = peak?.method === 'border-recovery'
      ? eligible.filter(c => c.score >= peak.score - 0.02).sort((a, b) => b.area - a.area)[0]
      : peak;
    const clipped = !!best && best.points.some((p, i) => {
      const next = best.points[(i + 1) % 4];
      return (p.x < 0.015 && next.x < 0.015) || (p.x > 0.985 && next.x > 0.985)
        || (p.y < 0.015 && next.y < 0.015) || (p.y > 0.985 && next.y > 0.985);
    });
    const geometrySupported = !!best && best.area >= 0.1 && best.edge >= 0.9
      && Math.abs(Math.log(best.ratio / 1.586)) < 0.12;
    const confident = !!best && (best.score >= 0.795 || geometrySupported) && !clipped;
    return { corners: best && best.score > 0.6 ? best.points : null, confidence: best?.score || 0, automatic: confident, rotation: best?.rotation || 0,
      ...(options.debug ? { debug: { modelPredicted: !!aiCorners, modelCorners: aiCorners, candidates: candidates.slice(0, 12) } } : {}) };
  } finally { input.delete(); gray.delete(); rgb.delete(); hsv.delete(); edges.delete(); mask.delete(); contours.delete(); hierarchy.delete(); }
}

export async function detectDocumentCorners(source: HTMLCanvasElement): Promise<ScanCorners | null> {
  return (await detectIdentityDocument(source)).corners;
}
export async function identityDocumentCropRegion(source: HTMLCanvasElement, corners: ScanCorners, rotation = 0) {
  if (!validScanCorners(corners)) throw new Error('Bốn góc bị giao nhau hoặc quá sát nhau. Hãy điều chỉnh lại.');
  if (source.width < 2 || source.height < 2) throw new Error('Ảnh không đủ kích thước để cắt.');
  const cv = await loadDocumentScanner();
  const pixels = corners.map((_, i) => corners[(i + rotation) % 4]).map(p => ({ x: p.x * (source.width - 1), y: p.y * (source.height - 1) }));
  const distance = (a: ScanPoint, b: ScanPoint) => Math.hypot(a.x - b.x, a.y - b.y);
  const horizontal = Math.max(distance(pixels[0], pixels[1]), distance(pixels[3], pixels[2]));
  const vertical = Math.max(distance(pixels[0], pixels[3]), distance(pixels[1], pixels[2]));
  const longest = Math.max(1, Math.round(Math.max(horizontal, vertical)));
  const width = horizontal >= vertical ? longest : Math.max(1, Math.round(longest / 1.586));
  const height = horizontal >= vertical ? Math.max(1, Math.round(longest / 1.586)) : longest;
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, pixels.flatMap(p => [p.x, p.y]));
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width - 1, 0, width - 1, height - 1, 0, height - 1]);
  const inverse = cv.getPerspectiveTransform(to, from);
  try {
    const m = inverse.data64F;
    const centerDenominator = m[6] * (width - 1) / 2 + m[7] * (height - 1) / 2 + m[8];
    // Inverse-project an enlarged card plane so all four margins sample real source pixels.
    const expanded = (padding: number) => [
      [-padding, -padding], [width - 1 + padding, -padding],
      [width - 1 + padding, height - 1 + padding], [-padding, height - 1 + padding],
    ].map(([x, y]) => {
      const denominator = m[6] * x + m[7] * y + m[8];
      return denominator * centerDenominator > 1e-12
        ? { x: (m[0] * x + m[1] * y + m[2]) / denominator, y: (m[3] * x + m[4] * y + m[5]) / denominator }
        : { x: NaN, y: NaN };
    }) as ScanCorners;
    const fits = (padding: number) => expanded(padding).every(p => Number.isFinite(p.x) && Number.isFinite(p.y)
      && p.x >= -1e-5 && p.y >= -1e-5 && p.x <= source.width - 1 + 1e-5 && p.y <= source.height - 1 + 1e-5);
    const requestedPadding = Math.max(24, Math.round(Math.min(width, height) * 0.08));
    let low = 0, high = requestedPadding;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (fits(middle)) low = middle; else high = middle - 1;
    }
    const samplingCorners = expanded(low).map(p => ({
      x: Math.max(0, Math.min(1, p.x / (source.width - 1))),
      y: Math.max(0, Math.min(1, p.y / (source.height - 1))),
    })) as ScanCorners;
    return { samplingCorners, padding: low, requestedPadding, cardWidth: width, cardHeight: height,
      width: width + low * 2, height: height + low * 2 };
  } finally { from.delete(); to.delete(); inverse.delete(); }
}

export async function flattenIdentityDocument(source: HTMLCanvasElement, corners: ScanCorners, rotation = 0): Promise<HTMLCanvasElement> {
  const region = await identityDocumentCropRegion(source, corners, rotation);
  const cv = await loadDocumentScanner();
  const input = cv.imread(source), output = new cv.Mat();
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, region.samplingCorners.flatMap(p => [p.x * (source.width - 1), p.y * (source.height - 1)]));
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, region.width - 1, 0, region.width - 1, region.height - 1, 0, region.height - 1]);
  const transform = cv.getPerspectiveTransform(from, to);
  try {
    cv.warpPerspective(input, output, transform, new cv.Size(region.width, region.height), cv.INTER_CUBIC, cv.BORDER_REPLICATE);
    const canvas = document.createElement('canvas'); cv.imshow(canvas, output);
    return canvas;
  } finally { input.delete(); output.delete(); from.delete(); to.delete(); transform.delete(); }
}
