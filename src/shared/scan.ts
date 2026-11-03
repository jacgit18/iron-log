// Label photo scan (brief label-photo-scan): turns what the model said about a nutrition-facts label into the few numbers a Ready-made food needs.
// Pure and shared by the server (which asks the model) and the app (which fills the form). The model's words are data: only the fixed fields
// below are read, each checked against a range, so text printed on a label cannot add a field or change a number's meaning. Nothing here is stored.

export const MAX_PHOTO_BASE64 = 2_000_000; // characters of base64 the route accepts (about 1.5 MB of JPEG); the app shrinks to fit well under it
export const MAX_NAME = 80;
export const MAX_SERVING = 40;

/** One label read: numbers per serving, optional ones left out when the label has none. */
export interface LabelFill { name?: string; serving?: string; servingG?: number; servingsPerPack?: number; kcal: number; p: number; c?: number; f?: number }

/** `ok`: usable numbers. `per100g`: only a per-100 g column was printed (nothing is converted; the name may still help). `unreadable`: no calories or protein. */
export type LabelResult = { kind: 'ok'; label: LabelFill } | { kind: 'per100g'; name?: string } | { kind: 'unreadable' };

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const inRange = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const text = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/\s+/g, ' ').trim().slice(0, max).trim();
  return t || undefined;
};
const one = (n: number) => Math.round(n * 10) / 10;

/** The JSON object in a model reply: the whole reply, or one fenced block. Anything else (prose around it, two objects) is refused. */
export function jsonFromReply(reply: unknown): unknown {
  if (typeof reply !== 'string') return null;
  let t = reply.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t);
  if (fenced?.[1] !== undefined) t = fenced[1];
  if (!t.startsWith('{') || !t.endsWith('}')) return null;
  try { return JSON.parse(t); } catch { return null; }
}

/** Checks one parsed answer. Calories 0 to 3000 and protein 0 to 300 per serving are required; every other field is dropped when out of range. */
export function cleanLabel(raw: unknown): LabelResult {
  const o = obj(raw);
  if (!o) return { kind: 'unreadable' };
  const name = text(o.name, MAX_NAME);
  if (o.per100gOnly === true) return { kind: 'per100g', ...(name ? { name } : {}) };
  const kcal = inRange(o.kcal, 0, 3000);
  const p = inRange(o.p, 0, 300);
  if (kcal === null || p === null) return { kind: 'unreadable' };
  const label: LabelFill = { kcal: Math.round(kcal), p: one(p) };
  if (name) label.name = name;
  const serving = text(o.serving, MAX_SERVING);
  if (serving) label.serving = serving;
  const g = inRange(o.servingG, 1, 5000);
  if (g !== null) label.servingG = Math.round(g);
  const packs = inRange(o.servingsPerPack, 0.5, 200);
  if (packs !== null) label.servingsPerPack = one(packs);
  const c = inRange(o.c, 0, 300);
  if (c !== null) label.c = one(c);
  const f = inRange(o.f, 0, 300);
  if (f !== null) label.f = one(f);
  return { kind: 'ok', label };
}

/** The route's answer as the app reads it; anything that is not a known shape is "unreadable". */
export function cleanScanAnswer(body: unknown): LabelResult {
  const result = obj(obj(body)?.result);
  if (!result) return { kind: 'unreadable' };
  if (result.kind === 'ok') return cleanLabel(result.label);
  if (result.kind === 'per100g') { const name = text(result.name, MAX_NAME); return { kind: 'per100g', ...(name ? { name } : {}) }; }
  return { kind: 'unreadable' };
}

/** A line for the Note field: what one serving is ("1 serving = 2/3 cup (55 g)."). Empty when the label gave neither. Servings per pack has its own box on the form (brief whole-pack). */
export function labelNote(l: LabelFill): string {
  const parts: string[] = [];
  if (l.serving || l.servingG) parts.push(`1 serving = ${[l.serving, l.servingG ? `${l.serving ? '(' : ''}${l.servingG} g${l.serving ? ')' : ''}` : ''].filter(Boolean).join(' ')}.`);
  return parts.join(' ').slice(0, 300);
}

/** The base64 of a JPEG: only that is sent on, so the route never forwards a different kind of file. */
export function isJpegBase64(v: unknown): v is string {
  return typeof v === 'string' && v.length > 100 && v.length <= MAX_PHOTO_BASE64 && v.length % 4 === 0 && v.startsWith('/9j/') && /^[A-Za-z0-9+/]+={0,2}$/.test(v);
}
