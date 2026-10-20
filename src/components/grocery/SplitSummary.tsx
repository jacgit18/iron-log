import { useAppStore } from '../../store/useAppStore.js';
import { money } from '../../lib/grocery.js';
import { allPeople, monthShare, payerOf, purchasesOf, storeSettlement, storesBought } from '../../lib/grocerySettle.js';
import { ME } from '../../lib/grocerySplit.js';
import type { Grocery, GroceryMonth } from '../../types.ts';
import './SplitSummary.css';

// What a month's shared groceries come to: what you paid, your own share (the number that is your spending), and what is owed to you, then
// one card per store that was shared or paid for by someone else, saying who pays whom. Only shown once a sharing group exists.
export default function SplitSummary({ g, month, mk }: { g: Grocery; month: GroceryMonth; mk: string }) {
  const purchases = purchasesOf(g, month);
  if (!purchases.length) return null;
  const names = new Map(allPeople(g).map(p => [p.id, p.n]));
  const who = (id: string) => (id === ME ? 'You' : names.get(id) ?? 'Someone');
  const { paid, yours } = monthShare(g, month);
  const cards = storesBought(g, purchases).map(store => ({ store, payer: payerOf(g, month, store), s: storeSettlement(g, month, store, purchases) }))
    .filter(c => c.s.rows.length > 0 || c.payer !== ME);
  const owed = cards.reduce((a, c) => a + c.s.owedToYou, 0);
  const s = useAppStore.getState();
  return (
    <section className="gsplit" aria-labelledby={`groc-split-h-${mk}`}>
      <h3 id={`groc-split-h-${mk}`}>Splitting this month</h3>
      <dl className="gsplitsum">
        <div><dt>Paid</dt><dd>{money(paid)}</dd></div>
        <div><dt>Your share</dt><dd>{money(yours)}</dd></div>
        <div><dt>Owed to you</dt><dd className={owed ? 'gowed' : undefined}>{money(owed)}</dd></div>
      </dl>
      {cards.map(({ store, payer, s: st }) => (
        <div key={store || '_'} className="gsplitcard">
          <div className="gsplithead">
            <b>{store || 'Anywhere'}</b>
            <label className="gpayer">Paid by
              <select aria-label={`Who paid at ${store || 'Anywhere'}`} value={payer} onChange={e => s.setGroceryPayer(mk, store, e.target.value === ME ? null : e.target.value)}>
                <option value={ME}>You</option>
                {[...names].map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select>
            </label>
          </div>
          <ul className="gsplitrows">
            <li><span>Bill</span><span>{money(st.bill)}</span></li>
            <li><span>Your share</span><span>{money(st.yourShare)}</span></li>
            {st.rows.map(r => (
              <li key={r.id + r.kind} className={r.kind === 'owesYou' || r.kind === 'youOwe' ? 'act' : undefined}>
                <span>{r.kind === 'owesYou' ? `${who(r.id)} owes you` : r.kind === 'youOwe' ? `You owe ${who(r.id)}` : r.kind === 'covered' ? `${who(r.id)}, already paid` : `${who(r.id)} owes ${who(payer)}`}</span>
                <span>{money(r.cents)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
