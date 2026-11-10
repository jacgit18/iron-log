import { cleanGtin, type ProductName } from '../shared/barcode.js';
import { BARCODE_TEXT, type BarcodeFailure } from './barcodeScan.js';

// Supplement barcode search (brief supplement-barcode-search): pure helpers for the add sheet. NIH cannot search by UPC, so a UPC (typed or scanned) is turned into a product name by
// the server and the name goes in the sheet's search box; the person picks the listing. Nothing here is stored.

/** The digits of a typed UPC (spaces and dashes allowed, as NIH and bottles write them), or null when the text is not a valid 8, 12, 13 or 14 digit product code. */
export function typedUpc(text: string): string | null {
  const digits = text.replace(/[\s-]/g, '');
  return /^\d{8,14}$/.test(digits) && cleanGtin(digits) ? digits : null;
}

const SEARCH_WORDS_MAX = 6, SEARCH_CHARS_MAX = 100; // what the catalog search accepts (server/catalog.ts parseSearch)
const words = (t: string) => t.toLowerCase().replace(/['’]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);

function fit(text: string): string {
  const out: string[] = [];
  let n = 0, len = 0;
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const k = words(w).length;
    if (n + k > SEARCH_WORDS_MAX || len + w.length + 1 > SEARCH_CHARS_MAX) break;
    out.push(w); n += k; len += w.length + 1;
  }
  return out.join(' ');
}

/** The searches to try for a scanned product, in order: brand and name, then the name alone (a brand written the way the barcode source writes it, such as a company name with "LLC", may match nothing in the catalog). Within the search limits, no repeats. */
export function scanSearchSteps(p: ProductName): string[] {
  const name = fit(p.name);
  const withBrand = p.brand && !words(p.name).join(' ').startsWith(words(p.brand).join(' ')) ? fit(`${p.brand} ${p.name}`) : name;
  return [...new Set([withBrand, name].filter(t => t.length >= 2))];
}

/** Why a scan or a typed UPC found nothing. The camera's own reasons are the food scan's words. */
export type SuppBarcodeFailure = BarcodeFailure | 'limit' | 'offline' | 'unavailable';

export const SUPP_BARCODE_TEXT: Record<SuppBarcodeFailure, string> = {
  ...BARCODE_TEXT,
  notfound: 'No product found for that barcode. Close this and type the name instead.',
  limit: 'You have used today’s barcode lookups. Type the name instead.',
  offline: 'You are offline. Type the name instead.',
  unavailable: 'Barcode lookup is not available right now. Try again, or type the name.',
};

export const suppBarcodeText = (f: SuppBarcodeFailure): string => SUPP_BARCODE_TEXT[f];

/** The line under a search filled from a barcode. */
export const fromBarcodeText = (p: ProductName): string => `From the barcode: ${p.name}. Pick the listing that matches your bottle.`;
