export type ReaderOptions = { formats?: string[]; tryHarder?: boolean; tryRotate?: boolean; tryInvert?: boolean; tryDownscale?: boolean; tryDenoise?: boolean; maxNumberOfSymbols?: number; binarizer?: string };
export function prepareZXingModule(options: { overrides: { locateFile: (path: string, prefix: string) => string }; fireImmediately?: false }): void;
export function purgeZXingModule(): void;
export type BarcodePoint = { x: number; y: number };
export function readBarcodes(input: ImageData, options?: ReaderOptions): Promise<{ text: string; isValid: boolean; format: string; position: { topLeft: BarcodePoint; topRight: BarcodePoint; bottomRight: BarcodePoint; bottomLeft: BarcodePoint } }[]>;
