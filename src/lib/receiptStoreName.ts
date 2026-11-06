// Brief receipt-add-store: the store name printed on a receipt, tidied so it can become a store on the grocery list.
// "COSTCO WHOLESALE #123" is "Costco", "TRADER JOE'S #45" is "Trader Joe's". Pure; the sheet shows the result in a box the person can edit.

const FILLER = new Set(['wholesale', 'inc', 'llc', 'ltd', 'corp', 'co', 'company', 'supercenter', 'superstore', 'store', 'stores']);
const MAX_NAME = 40;

/** The tidy store name, or null when nothing usable is left (fewer than 3 letters). The text stops at the first comma or dash, a store number (#123) or the first all-digit word (a street number), and filler words are dropped. */
export function cleanStoreName(raw: string | undefined): string | null {
  if (!raw) return null;
  const head = raw.split(/[,;]| - | – /)[0]!;
  const words: string[] = [];
  for (const w of head.trim().split(/\s+/)) {
    if (/^#/.test(w) || /^\d+$/.test(w)) break;
    if (FILLER.has(w.toLowerCase().replace(/[^a-z]/g, ''))) continue;
    words.push(w);
  }
  const name = words.join(' ').toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase()).slice(0, MAX_NAME).trim();
  return name.replace(/[^a-z]/gi, '').length >= 3 ? name : null;
}
