import { money } from '../../lib/grocery.js';
import { monthOwes, monthShare, purchasesOf, storeSettlement, storeStatus } from '../../lib/grocerySettle.js';
import type { Grocery, GroceryMonth } from '../../types.ts';
import Icon from '../Icon.jsx';
import './StoreMoney.css';

// The month's shared-grocery money where you shop, so it never takes a scroll to the split card to read: one line over the list (paid, your
// share, owed to you) and one line under a shared store's heading (its bill, your share, and who owes whom). Nothing shows until something is bought.
export function MonthMoney({ g, month, onOpen }: { g: Grocery; month: GroceryMonth; onOpen?: () => void }) {
  if (!purchasesOf(g, month).length) return null;
  const { paid, yours } = monthShare(g, month);
  const { owed, youOwe } = monthOwes(g, month);
  // Owed to you is said even at $0.00, except when you owe someone and nobody owes you; You owe is added only when another store's payer is someone else.
  const text = <>Paid {money(paid)} · Your share {money(yours)}{youOwe > 0 && owed === 0 ? '' : ` · Owed to you ${money(owed)}`}{youOwe > 0 ? ` · You owe ${money(youOwe)}` : ''}</>;
  // With a way to open the split section, the line is a button that opens it and scrolls there; without, plain text as before.
  return onOpen ? <button type="button" className="gmoney gmoneybtn" id="groc-money" onClick={onOpen}>{text}<span className="vh"> Go to Splitting this month</span><Icon name="chevron-down" /></button> : <p className="note gmoney" id="groc-money">{text}</p>;
}

export function StoreMoney({ g, month, store }: { g: Grocery; month: GroceryMonth; store: string }) {
  const purchases = purchasesOf(g, month);
  if (!purchases.some(p => p.store === store)) return null;
  const st = storeSettlement(g, month, store, purchases); const t = storeStatus(g, month, store, purchases); // what is still owed: amounts marked settled are left out
  const involvesYou = t.rows.some(r => r.kind !== 'owesPayer');
  return (
    <p className="note gstoremoney">
      Bought {money(st.bill)}{st.tax > 0 ? ` (tax ${money(st.tax)})` : ''} · Your share {money(st.yourShare)}{t.owed > 0 ? ` · Owed to you ${money(t.owed)}` : ''}{t.youOwe > 0 ? ` · You owe ${money(t.youOwe)}` : ''}{involvesYou && t.outstanding === 0 ? ' · Settled ✓' : ''}
    </p>
  );
}
