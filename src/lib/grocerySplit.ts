import type { GroceryGroup, GroceryShare } from '../types.ts';

/* ---------- Splitting a grocery purchase between people ----------
   Pure money math, in whole cents, with no store or UI in it. A purchase has "parties": you (`ME`) and the other people who share it.
   Everyone gets an equal share rounded to the cent; you take the odd cents (or, for something that is not yours, the last person does),
   so the shares always add up to the price exactly. */

/** The id the owner of the list has in every split. People have ids of their own. */
export const ME = 'me';

/** Who shares a purchase, most specific first: its own choice, else the store's group (everyone in it), else just you. `known` is the set of
 *  person ids that still exist, so a person who was removed drops out instead of leaving money with nobody. */
export function partiesOf(share: GroceryShare | null | undefined, storeGroup: GroceryGroup | undefined, known: ReadonlySet<string>): string[] {
  if (share) {
    const ids = share.with.filter(id => known.has(id));
    if (share.notMine && ids.length) return ids; // for others only: you pay now and are repaid in full
    return [ME, ...ids];
  }
  if (storeGroup) return [ME, ...storeGroup.people.map(p => p.id).filter(id => known.has(id))];
  return [ME];
}

/** Divide `cents` equally among `parties`. Each other person gets the rounded share (never more than is left); you get the remainder, or the last
 *  party does when you are not in it. The result adds up to `cents`. */
export function splitCents(cents: number, parties: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  const list = parties.length ? parties : [ME];
  const absorber = list.includes(ME) ? ME : list[list.length - 1];
  const each = Math.round(cents / list.length);
  let left = cents;
  list.forEach(id => {
    if (id === absorber) return;
    const give = Math.min(each, left);
    out[id] = (out[id] ?? 0) + give; left -= give;
  });
  out[absorber] = (out[absorber] ?? 0) + left;
  return out;
}

/** One thing bought: what it cost and who shares it. */
export interface Purchase { cents: number; parties: readonly string[] }

/** Everyone's total over a set of purchases. */
export function totalsOf(purchases: readonly Purchase[]): Record<string, number> {
  const out: Record<string, number> = {};
  purchases.forEach(p => { Object.entries(splitCents(p.cents, p.parties)).forEach(([id, c]) => { out[id] = (out[id] ?? 0) + c; }); });
  return out;
}

export interface SettleRow {
  id: string;
  /** owesYou: ask them for it. covered: their share is already paid some other way. youOwe: you pay the one who paid. owesPayer: between others. */
  kind: 'covered' | 'owesPayer' | 'owesYou' | 'youOwe';
  cents: number;
}
export interface Settlement { bill: number; yourShare: number; owedToYou: number; youOwe: number; rows: SettleRow[] }

/** Who pays whom for a set of purchases. `payer` is who put the bill on their card: `ME` (the others owe you) or a person (you owe them your
 *  share). `covered` is the set of people whose share is already paid, so nothing is asked of them. */
export function settle(purchases: readonly Purchase[], payer: string, covered: ReadonlySet<string>): Settlement {
  const totals = totalsOf(purchases);
  const bill = purchases.reduce((a, p) => a + p.cents, 0);
  const yourShare = totals[ME] ?? 0;
  const rows: SettleRow[] = [];
  let owedToYou = 0, youOwe = 0;
  Object.entries(totals).forEach(([id, cents]) => {
    if (id === ME || id === payer || cents <= 0) return;
    if (payer === ME) {
      if (covered.has(id)) rows.push({ id, kind: 'covered', cents });
      else { rows.push({ id, kind: 'owesYou', cents }); owedToYou += cents; }
    } else rows.push({ id, kind: 'owesPayer', cents });
  });
  if (payer !== ME && yourShare > 0) { rows.unshift({ id: payer, kind: 'youOwe', cents: yourShare }); youOwe = yourShare; }
  return { bill, yourShare, owedToYou, youOwe, rows };
}
