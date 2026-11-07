import { money } from './grocery.js';
import type { Check, Plan } from './groceryReceipt.js';

// Brief receipt-apply-footer: the words on the receipt sheet's bottom bar and when Apply needs a second tap. Pure; ReceiptApplyBar only draws them.
type Counts = Pick<Plan, 'items' | 'itemsCents' | 'taxStore' | 'untick'> & { check: Pick<Check, 'taxCents'> };

const noun = (n: number) => (n === 1 ? 'item' : 'items');

/** The tax is part of what Apply writes only when a store is set for it. */
export const applyTotalCents = (p: Counts): number => p.itemsCents + (p.taxStore ? p.check.taxCents : 0);

/** The Apply button says what it will do: "Apply 5 items, $40.69", or "Move 2 items back to Shopping" when that is all there is. */
export function applyLabel(p: Counts): string {
  if (p.items === 0 && p.untick.length > 0 && !p.taxStore) return `Move ${p.untick.length} ${noun(p.untick.length)} back to Shopping`;
  return `Apply ${p.items} ${noun(p.items)}, ${money(applyTotalCents(p))}`;
}

/** The line above the button: the same facts as before (items, tax, new items, items moving back), plus whether the receipt total matches. */
export function applySummary(p: Counts, newCount: number, mismatch: boolean): string {
  const parts = [`${p.items} ${noun(p.items)}, ${money(p.itemsCents)}${p.taxStore ? ` + ${p.taxStore} tax ${money(p.check.taxCents)}` : ''}`];
  if (newCount > 0) parts.push(`${newCount} new ${noun(newCount)} will be added`);
  if (p.untick.length > 0) parts.push(`${p.untick.length} will move back to Shopping`);
  if (mismatch) parts.push('The lines and tax do not match the receipt total');
  return `${parts.join('. ')}.`;
}

/** Apply takes two taps only when the lines and tax do not explain the receipt total. A receipt with no total, or one that matches, takes one. */
export const needsConfirm = (c: Pick<Check, 'diffCents'>): boolean => c.diffCents !== null && c.diffCents !== 0;
