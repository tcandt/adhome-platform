export class HTMLCanvasElementLuminanceSource { constructor(canvas: HTMLCanvasElement); }
export class HybridBinarizer { constructor(source: HTMLCanvasElementLuminanceSource); }
export class BinaryBitmap { constructor(binarizer: HybridBinarizer); }
export class QRCodeReader { decode(bitmap: BinaryBitmap, hints?: Map<number, unknown>): { getText(): string }; }
export const DecodeHintType: { TRY_HARDER: number; CHARACTER_SET: number };
