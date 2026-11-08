import { parseDollars } from '../../lib/grocery.js';

// The two typed boxes of a row, for To get (this month) and At home (the usual): each says whether the text was accepted, and saves through `save` when it was.
export const commitQty = (t: string, save: (n: number) => void) => { const n = Number(t); if (!t.trim() || !Number.isFinite(n) || Math.round(n * 100) / 100 <= 0 || n > 999) return false; save(n); return true; }; // the count is kept to two decimals, so 0.001 would round to nothing
export const commitPrice = (t: string, save: (cents: number | null) => void) => { if (!t.trim()) { save(null); return true; } const c = parseDollars(t); if (c == null) return false; save(c); return true; };
