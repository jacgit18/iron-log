// Label photo allowance (brief barcode-miss-ladder): how many AI label reads are left today, as the last label answer said. The cap counts for the whole
// server, not per person (server/scan.ts), so this is a shared number and is shown only once an answer has carried it; until then the button just says "Uses AI".
export interface Allowance { left: number; max: number }

let known: Allowance | null = null;
let until = 0; // when a "none left" count stops being believed: the day rolls over, and another server instance may still have uses (the cap is per instance)
export const USED_UP_MAX_MS = 10 * 60_000;
const holdMs = (retryAfterSec: unknown) => (typeof retryAfterSec === 'number' && retryAfterSec > 0 ? Math.min(retryAfterSec * 1000, USED_UP_MAX_MS) : USED_UP_MAX_MS);

/** Keeps what an answer said (a missing or odd count is ignored). */
export function rememberAllowance(body: unknown, now = Date.now()): void {
  const o = body as { left?: unknown; max?: unknown } | null;
  if (o && Number.isInteger(o.left) && Number.isInteger(o.max) && (o.max as number) > 0 && (o.left as number) >= 0 && (o.left as number) <= (o.max as number)) { known = { left: o.left as number, max: o.max as number }; until = known.left === 0 ? now + USED_UP_MAX_MS : 0; }
}

/** The cap said no: nothing is left, whatever the last count was. */
export function markUsedUp(retryAfterSec?: unknown, now = Date.now()): void { known = { left: 0, max: known?.max ?? 0 }; until = now + holdMs(retryAfterSec); }

/** What the last answer said; a "none left" count older than its hold is forgotten, so the button comes back and the next try asks the server. */
export function currentAllowance(now = Date.now()): Allowance | null {
  if (known && known.left === 0 && until > 0 && now >= until) { known = null; until = 0; }
  return known;
}
export function resetAllowance(): void { known = null; until = 0; }

/** The note under Photo the label. */
export const labelCostText = (a: Allowance | null): string => (a && a.max > 0 ? `Uses AI · ${a.left} of ${a.max} left today` : 'Uses AI');
/** True when the label button is switched off. */
export const labelUsedUp = (a: Allowance | null): boolean => !!a && a.left <= 0;
export const LABEL_USED_UP_TEXT = 'Label photos are used up for today. Type the name instead.';
