import { money } from '../../lib/grocery.js';
import { purchasesOf, storeSettlement, storeStatus } from '../../lib/grocerySettle.js';
import type { Grocery, GroceryMonth } from '../../types.ts';
import './StoreMoney.css';

// The month's shared-grocery money where you shop: one line under a shared store's heading (its bill, your share, and who owes whom). Nothing shows until something is bought.
// The month's totals (paid, your share, owed to you) are in the Who owes who card on Bought (the line that was over the list went in brief groceries-bought-inventory-lists).
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
