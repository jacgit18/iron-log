// A JSON string can carry an unpaired UTF-16 surrogate: the phone clips a note at 200 characters and the cut can fall between the two halves of an emoji, which
// JSON.stringify writes as the escape \ud800. Postgres refuses that inside jsonb (SQLSTATE 22P02), which is not one of the data errors answered with a 422,
// so the request became a 500 that the phone retried forever and that raised the 5xx alert (overnight audit S-1). After the body is parsed, every string
// (a value or a key) with a stray half has it replaced by U+FFFD, the replacement character, so what reaches the database is always well-formed.
// It walks with its own stack, not by recursion: a body nested thousands deep must still reach the 422 that handles it (code audit S-04), not overflow here.
import type { NextFunction, Request, Response } from 'express';

// String.prototype.isWellFormed and toWellFormed (Node 20 and later) are not in this project's TypeScript library yet.
type WellFormed = string & { isWellFormed(): boolean; toWellFormed(): string };
const ok = (s: string) => (s as WellFormed).isWellFormed();
const fix = (s: string) => (s as WellFormed).toWellFormed();

// The deepest nesting a request body may have. The app's own documents are about 10 levels deep (the v1 data fixture), so 64 leaves plenty of room; a deeper body
// is refused with a 422 before anything is stored (code audit S-04). Node's stack cannot be relied on to refuse it: JSON.stringify no longer overflows on Node 26, so a
// config nested 8000 deep was stored, and Express then failed to send it back, which broke that account's sync feed for good.
export const MAX_JSON_DEPTH = 64;

/** True when the value is nested deeper than `max` levels (the root counts as 1). Walks with its own stack, so no depth can overflow it. */
export function jsonDepthExceeds(root: unknown, max = MAX_JSON_DEPTH): boolean {
  const stack: Array<[unknown, number]> = [[root, 1]];
  while (stack.length) {
    const [node, depth] = stack.pop() as [unknown, number];
    if (!node || typeof node !== 'object') continue;
    if (depth > max) return true;
    for (const child of Object.values(node)) if (child && typeof child === 'object') stack.push([child, depth + 1]);
  }
  return false;
}

export function repairWellFormed(root: unknown): void {
  const stack: unknown[] = [root];
  while (stack.length) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const x = node[i];
        if (typeof x === 'string') { if (!ok(x)) node[i] = fix(x); } else if (x && typeof x === 'object') stack.push(x);
      }
    } else if (node && typeof node === 'object') {
      const o = node as Record<string, unknown>;
      for (const k of Object.keys(o)) {
        const x = o[k];
        const repaired = typeof x === 'string' && !ok(x) ? fix(x) : x;
        if (!ok(k)) { delete o[k]; o[fix(k)] = repaired; } else if (repaired !== x) o[k] = repaired;
        if (x && typeof x === 'object') stack.push(x);
      }
    }
  }
}

/** Express middleware: refuses a body nested too deep (a 422 through the error handler, code 54001), then repairs the parsed body in place. Put it right after a JSON body parser. */
export const repairBody = (req: Request, _res: Response, next: NextFunction) => {
  if (jsonDepthExceeds(req.body)) return next(Object.assign(new Error('JSON nested too deep'), { code: '54001' }));
  repairWellFormed(req.body);
  next();
};
