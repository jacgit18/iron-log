// Bottle scan allowance (brief supplement-label-scan): how many Supplement Facts reads are left today for this person, as the last answer said. Kept apart from the label
// allowance (labelAllowance.ts) because the server counts bottle scans on their own (5 a person a day). Shown only once an answer has carried it; until then the button just says "Uses AI".
export interface SupplementAllowance { left: number; max: number }

let known: SupplementAllowance | null = null;
let until = 0; // when a "none left" count stops being believed: the day rolls over, and another server instance may still have uses (the cap is per instance)
export const SUPPLEMENT_USED_UP_MAX_MS = 10 * 60_000;
const holdMs = (retryAfterSec: unknown) => (typeof retryAfterSec === 'number' && retryAfterSec > 0 ? Math.min(retryAfterSec * 1000, SUPPLEMENT_USED_UP_MAX_MS) : SUPPLEMENT_USED_UP_MAX_MS);

/** Keeps what an answer said (a missing or odd count is ignored). */
export function rememberSupplementAllowance(body: unknown, now = Date.now()): void {
  const o = body as { left?: unknown; max?: unknown } | null;
  if (o && Number.isInteger(o.left) && Number.isInteger(o.max) && (o.max as number) > 0 && (o.left as number) >= 0 && (o.left as number) <= (o.max as number)) { known = { left: o.left as number, max: o.max as number }; until = known.left === 0 ? now + SUPPLEMENT_USED_UP_MAX_MS : 0; }
}

/** The cap said no: nothing is left, whatever the last count was. */
export function markSupplementUsedUp(retryAfterSec?: unknown, now = Date.now()): void { known = { left: 0, max: known?.max ?? 0 }; until = now + holdMs(retryAfterSec); }

/** What the last answer said; a "none left" count older than its hold is forgotten, so the button comes back and the next try asks the server. */
export function currentSupplementAllowance(now = Date.now()): SupplementAllowance | null {
  if (known && known.left === 0 && until > 0 && now >= until) { known = null; until = 0; }
  return known;
}
export function resetSupplementAllowance(): void { known = null; until = 0; }

/** The note under the button. */
export const supplementCostText = (a: SupplementAllowance | null): string => (a && a.max > 0 ? `Uses AI · ${a.left} of ${a.max} left today` : 'Uses AI');
/** True when the bottle button is switched off. */
export const supplementUsedUp = (a: SupplementAllowance | null): boolean => !!a && a.left <= 0;
export const SUPPLEMENT_USED_UP_TEXT = 'Bottle scans are used up for today. Type the amounts instead.';
