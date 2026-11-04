import { gtinFromScan } from '../shared/barcode.js';
import { FOODS_FAILURE_TEXT, type FoodsFailure } from './foodsClient.js';

// Barcode scan (brief barcode-scan): the browser's own barcode reader, the code it reads, and the words for each way a scan can end. No package: where the
// browser has no reader the sheet says so and the person types the name instead. Only the digits ever leave the phone; the picture is read here and dropped.

interface Reading { rawValue?: unknown; format?: unknown }
export interface Reader { detect(source: ImageBitmapSource): Promise<Reading[]> }
interface ReaderClass { new (opts: { formats: string[] }): Reader; getSupportedFormats?: () => Promise<string[]> }

/** The product code formats on grocery packs: EAN-13, UPC-A, EAN-8, and UPC-E on small packs. */
const FORMATS = ['ean_13', 'upc_a', 'ean_8', 'upc_e'];

/** The browser's reader for those formats, or null when it has none (Firefox, some Safari) or none of them. */
export async function makeReader(): Promise<Reader | null> {
  const Ctor = typeof window === 'undefined' ? undefined : (window as unknown as { BarcodeDetector?: ReaderClass }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const have = Ctor.getSupportedFormats ? await Ctor.getSupportedFormats() : FORMATS;
    const formats = FORMATS.filter(f => have.includes(f));
    return formats.length ? new Ctor({ formats }) : null;
  } catch { return null; }
}

/** The first thing read that is a usable product code (right length, right check digit), as 14 digits. A misread or a QR code is skipped. */
export function pickGtin(readings: readonly Reading[]): string | null {
  for (const r of readings) {
    const g = gtinFromScan(r.rawValue, typeof r.format === 'string' ? r.format : undefined);
    if (g) return g;
  }
  return null;
}

/** Reads a frame or a photo; a reader that throws on one frame (not ready yet) is a frame with no code. */
export async function readGtin(reader: Reader, source: ImageBitmapSource): Promise<string | null> {
  try { return pickGtin(await reader.detect(source)); } catch { return null; }
}

export type BarcodeFailure = 'nodetector' | 'camera' | 'unreadable' | 'notfound' | FoodsFailure['reason'];

/** The words in the sheet for each way a scan can end. */
export const BARCODE_TEXT: Record<BarcodeFailure, string> = {
  nodetector: 'This browser cannot read barcodes. Close this and type the name instead.',
  camera: 'The camera is not available. Choose a photo of the barcode instead.',
  unreadable: 'Could not read a barcode in that photo. Try a closer, steadier photo, or close this and type the name.',
  notfound: 'That barcode is not in the food database. Close this and type the name instead.',
  ...FOODS_FAILURE_TEXT,
};
