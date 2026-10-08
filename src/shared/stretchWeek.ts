import type { StretchWeek } from '../types.ts';

/* ---------- Stretch week shape ----------
   A stretch week is {done: {"<day 0-6>:<id>": true}, skipped: {"<day 0-6>": true}, extra: [{id, day, n, url, note}]}.
   normStretchWeek takes anything and returns the clean week. Framework-free, so the client and the API share it (ADR 015). */

export const STRETCH_DAYS = 7;

export const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const goodUrl = (u: string) => !u || /^https?:\/\//.test(u);

export function normStretchWeek(w: any): StretchWeek {
  const out: StretchWeek = { done: {}, skipped: {}, extra: [] };
  if (!w || typeof w !== 'object') return out;
  if (w.done && typeof w.done === 'object') Object.keys(w.done).forEach(k => { if (w.done[k] && /^[0-6]:.+/.test(k)) out.done[k] = true; });
  if (w.skipped && typeof w.skipped === 'object') Object.keys(w.skipped).forEach(k => { if (w.skipped[k] && /^[0-6]$/.test(k)) out.skipped[k] = true; });
  (Array.isArray(w.extra) ? w.extra : []).forEach((x: any) => {
    if (x && typeof x === 'object' && str(x.id, 60) && str(x.n, 80) && Number.isInteger(x.day) && x.day >= 0 && x.day < STRETCH_DAYS && !out.extra.some(e => e.id === x.id)) {
      out.extra.push({ id: x.id, day: x.day, n: str(x.n, 80), ...(goodUrl(str(x.url, 500)) && str(x.url, 500) ? { url: str(x.url, 500) } : {}), ...(str(x.note, 200) ? { note: str(x.note, 200) } : {}) });
    }
  });
  return out;
}
