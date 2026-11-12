/* ---------- Unknown keys of a synced settings object (ADR 122) ----------
   A normalizer builds its output only from the keys it knows, so a build that predates a key erases it on its next save and
   the erase syncs to every device. `keepUnknownKeys` lets keys this build does not know ride through, under hard bounds,
   because this is a security boundary: the value came from storage, a file or a request. Framework-free (client and API share it). */

/** Never a key: they would rewrite the prototype of the object the value is copied into. */
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
const KEY = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

export const MAX_UNKNOWN_KEYS = 8; // kept keys per object
export const MAX_UNKNOWN_DEPTH = 4; // nesting of arrays and objects inside a kept value
export const MAX_UNKNOWN_BREADTH = 50; // items of an array, keys of an inner object
export const MAX_UNKNOWN_TEXT = 200; // characters of a string
export const MAX_UNKNOWN_BYTES = 4096; // serialized size of one kept value

/** A copy of `v` when it is plain, bounded JSON with safe keys, else undefined (never a partial copy: an unusable value is dropped whole). */
function cleanJson(v: unknown, depth: number): unknown {
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') return v.length <= MAX_UNKNOWN_TEXT ? v : undefined;
  if (depth >= MAX_UNKNOWN_DEPTH || typeof v !== 'object') return undefined;
  if (Array.isArray(v)) {
    if (v.length > MAX_UNKNOWN_BREADTH) return undefined;
    const out: unknown[] = [];
    for (const x of v) { const c = cleanJson(x, depth + 1); if (c === undefined) return undefined; out.push(c); }
    return out;
  }
  if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) return undefined;
  const entries = Object.entries(v);
  if (entries.length > MAX_UNKNOWN_BREADTH) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, x] of entries) {
    if (UNSAFE.has(k) || !KEY.test(k)) return undefined;
    const c = cleanJson(x, depth + 1);
    if (c === undefined) return undefined;
    out[k] = c;
  }
  return out;
}

/** The keys of `o` that are not in `known`, each kept only as safe bounded JSON, at most MAX_UNKNOWN_KEYS (the first in key order). A known key is never returned: the caller cleaned it, and a bad value must stay dropped. */
export function keepUnknownKeys(o: Record<string, unknown>, known: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const k of Object.keys(o).sort()) {
    if (n >= MAX_UNKNOWN_KEYS) break;
    if (known.includes(k) || UNSAFE.has(k) || !KEY.test(k)) continue;
    const c = cleanJson(o[k], 0);
    if (c === undefined || JSON.stringify(c).length > MAX_UNKNOWN_BYTES) continue;
    out[k] = c; n++;
  }
  return out;
}
