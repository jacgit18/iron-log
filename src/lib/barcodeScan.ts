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
  notfound: 'That barcode is not in USDA or Open Food Facts.',
  ...FOODS_FAILURE_TEXT,
};

/** The sheet's line for a failure. */
export const barcodeText = (fail: BarcodeFailure): string => BARCODE_TEXT[fail];

/** While the lookup runs (brief barcode-miss-ladder): the server asks USDA first and Open Food Facts only when USDA has nothing, in one request, so the line moves on after a short wait. */
export const OFF_AFTER_MS = 1200;
export const lookingText = (waitedMs: number): string => (waitedMs < OFF_AFTER_MS ? 'Checking USDA...' : 'Checking Open Food Facts...');

/** What was tried before a miss, in the order it was tried. */
export const MISS_STEPS = ['USDA: not found', 'Open Food Facts: not found'] as const;

/** The ids of the boxes a person types a food name into; "Type the name" moves the cursor to the first one on the page. */
export const SEARCH_BOX_IDS = ['dt-lookup-q', 'dt-find-q'] as const;

/** The AI mark's line under a label read from a photo, before Use. */
export const AI_LABEL_TEXT = 'Read from the photo. Check these numbers against the label.';

/** Under a product from Open Food Facts (brief barcode-coverage): where it came from and that anyone can edit it there. USDA products show nothing. */
export const OFF_SOURCE_TEXT = 'Data from Open Food Facts. Crowd-sourced: check the numbers against the label.';
