import type { Stretch, StretchExperiment } from '../types.ts';
import { goodUrl, str } from './stretchWeek.js';

/* ---------- One item of a small list: a stretch, a stretch experiment ----------
   Each cleaner takes anything and returns the clean item, or null when it can't be used (the caller drops
   duplicate ids). Framework-free, so the client and the API share the rules (ADR 015). */

export const DEFAULT_GROUP = 'Other';

const urlOf = (x: any) => (goodUrl(str(x.url, 500)) && str(x.url, 500) ? { url: str(x.url, 500) } : {});
const noteOf = (x: any, max = 200) => (str(x.note, max) ? { note: str(x.note, max) } : {});

export function normStretchItem(x: any): Stretch | null {
  if (!x || typeof x !== 'object' || !str(x.id, 60) || !str(x.n, 80)) return null;
  return { id: x.id, n: str(x.n, 80), group: str(x.group, 40) || DEFAULT_GROUP, tier: x.tier === 'primary' || x.tier === 'secondary' ? x.tier : '', ...urlOf(x), ...noteOf(x) };
}

export function normStretchExperimentItem(x: any): StretchExperiment | null {
  if (!x || typeof x !== 'object' || !str(x.id, 60) || !str(x.n, 80)) return null;
  return { id: x.id, n: str(x.n, 80), ...urlOf(x), ...noteOf(x) };
}
