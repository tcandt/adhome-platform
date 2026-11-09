import { parseIdentityQr } from './identityQr';
import { prepareZXingModule, purgeZXingModule, readBarcodes, type ReaderOptions } from '../vendor/zxing-wasm/reader/index.js';
import readerWasmUrl from '../vendor/zxing-wasm/reader/zxing_reader.wasm?url';

const wasmOverrides = { locateFile: (path: string, prefix: string) => path.endsWith('.wasm') ? readerWasmUrl : prefix + path };
prepareZXingModule({ overrides: wasmOverrides });

async function readQrCodes(pixels: ImageData, options: ReaderOptions = {}) {
  try {
    return await readBarcodes(pixels, { formats: ['QRCode'], tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, maxNumberOfSymbols: 4, ...options });
  } catch (error) {
    // A failed asset request must not poison subsequent upload/camera attempts.
    purgeZXingModule();
    prepareZXingModule({ overrides: wasmOverrides });
    // jsQR can still decode this frame when the optional WASM reader fails.
    return [];
  }
}

// Return geometry only; the scanner never stores or logs decoded identity information.
export async function locateIdentityQr(source: HTMLCanvasElement) {
  for (const limit of [1100, 1800, 2600]) {
    const scale = Math.min(1, limit / Math.max(source.width, source.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(source.width * scale); canvas.height = Math.round(source.height * scale);
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const codes = await readQrCodes(pixels);
    const code = codes.find(code => code.isValid && /^\d{12}\|/.test(code.text));
    if (code?.position) return [code.position.topLeft, code.position.topRight, code.position.bottomRight, code.position.bottomLeft]
      .map(point => ({ x: point.x / canvas.width, y: point.y / canvas.height }));
    if (scale === 1) break;
  }
  return null;
}

// An integral image keeps local illumination correction linear in pixel count.
function adaptiveThreshold(pixels: ImageData) {
  const { width, height, data } = pixels;
  const stride = width + 1;
  const sums = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      row += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row;
    }
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const x0 = Math.max(0, x - 10), y0 = Math.max(0, y - 10);
    const x1 = Math.min(width, x + 11), y1 = Math.min(height, y + 11);
    const mean = (sums[y1 * stride + x1] - sums[y0 * stride + x1] - sums[y1 * stride + x0] + sums[y0 * stride + x0]) / ((x1 - x0) * (y1 - y0));
    const i = (y * width + x) * 4;
    const value = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < mean - 6 ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = value;
  }
}

export async function decodeIdentityQr(source: CanvasImageSource, width: number, height: number, thorough = false, active = () => true) {
  const { default: jsQR } = await import('../vendor/jsqr/jsQR.cjs');
  const regions = [{ x: 0, y: 0, w: width, h: height, limit: 1600 }];
  if (thorough) {
    // Overlapping crops isolate small identity QR codes from textured backgrounds.
    regions.push({ x: 0, y: 0, w: width, h: height, limit: 800 });
    regions.push({ x: 0, y: 0, w: width, h: height, limit: 2600 });
    for (const ratio of [0.6, 0.4, 0.22]) {
      for (const y of [0, (height * (1 - ratio)) / 2, height * (1 - ratio)]) {
        for (const x of [0, (width * (1 - ratio)) / 2, width * (1 - ratio)]) {
          regions.push({ x, y, w: width * ratio, h: height * ratio, limit: 700 });
          regions.push({ x, y, w: width * ratio, h: height * ratio, limit: 1400 });
        }
      }
    }
  }
  else {
    // The QR often occupies only the center of a live camera frame.
    regions.push({ x: width * 0.2, y: height * 0.2, w: width * 0.6, h: height * 0.6, limit: 1400 });
  }
  let invalid: Error | undefined;
  const accept = (text: string) => {
    if (!text) return null;
    try { return parseIdentityQr(text); }
    catch (error) { invalid = error instanceof Error ? error : new Error('QR căn cước không hợp lệ.'); return null; }
  };
  for (const region of regions) {
    if (!active()) return null;
    const scale = Math.min(thorough && region.w < width ? 3 : 1, region.limit / Math.max(region.w, region.h));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(region.w * scale)); canvas.height = Math.max(1, Math.round(region.h * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Thiết bị không hỗ trợ đọc ảnh.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, region.x, region.y, region.w, region.h, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const decoded = await readQrCodes(pixels);
    for (const code of decoded.filter(code => code.isValid)) { const data = accept(code.text); if (data) return data; }
    const code = jsQR(pixels.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
    if (code?.data) { const data = accept(code.data); if (data) return data; }
    if (thorough && region.w < width * 0.5) {
      const original = new Uint8ClampedArray(pixels.data);
      if (!active()) return null;
      adaptiveThreshold(pixels);
      const codes = await readQrCodes(pixels, { binarizer: 'FixedThreshold' });
      for (const code of codes.filter(code => code.isValid)) { const data = accept(code.text); if (data) return data; }
      const binary = jsQR(pixels.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
      if (binary?.data) { const data = accept(binary.data); if (data) return data; }
      pixels.data.set(original);
      // Lift dark print from colored/security-pattern backgrounds without changing QR data.
      for (let i = 0; i < pixels.data.length; i += 4) {
        const level = Math.max(0, Math.min(255, (0.299 * pixels.data[i] + 0.587 * pixels.data[i + 1] + 0.114 * pixels.data[i + 2] - 128) * 1.7 + 128));
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = level;
      }
      const enhanced = jsQR(pixels.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
      if (enhanced?.data) { const data = accept(enhanced.data); if (data) return data; }
    }
    if (thorough) await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  if (invalid) throw invalid;
  return null;
}
