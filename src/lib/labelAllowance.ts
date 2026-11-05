// Label photo allowance (brief barcode-miss-ladder): how many AI label reads are left today, as the last label answer said. The cap counts for the whole
// server, not per person (server/scan.ts), so this is a shared number and is shown only once an answer has carried it; until then the button just says "Uses AI".
export interface Allowance { left: number; max: number }

let known: Allowance | null = null;

/** Keeps what an answer said (a missing or odd count is ignored). */
export function rememberAllowance(body: unknown): void {
  const o = body as { left?: unknown; max?: unknown } | null;
  if (o && Number.isInteger(o.left) && Number.isInteger(o.max) && (o.max as number) > 0 && (o.left as number) >= 0 && (o.left as number) <= (o.max as number)) known = { left: o.left as number, max: o.max as number };
}

/** The cap said no: nothing is left, whatever the last count was. */
export function markUsedUp(): void { known = { left: 0, max: known?.max ?? 0 }; }

export const currentAllowance = (): Allowance | null => known;
export function resetAllowance(): void { known = null; }

/** The note under Photo the label. */
export const labelCostText = (a: Allowance | null): string => (a && a.max > 0 ? `Uses AI · ${a.left} of ${a.max} left today` : 'Uses AI');
/** True when the label button is switched off. */
export const labelUsedUp = (a: Allowance | null): boolean => !!a && a.left <= 0;
export const LABEL_USED_UP_TEXT = 'Label photos are used up for today. Type the name instead.';
