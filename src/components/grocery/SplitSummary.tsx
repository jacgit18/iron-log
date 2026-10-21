import { useAppStore } from '../../store/useAppStore.js';
import { money } from '../../lib/grocery.js';
import { allPeople, everyone, monthOwed, monthShare, payerOf, purchasesOf, storeSettlement, storesBought } from '../../lib/grocerySettle.js';
import { ME } from '../../lib/grocerySplit.js';
import type { Grocery, GroceryMonth } from '../../types.ts';
import './SplitSummary.css';

// What a month's shared groceries come to: what you paid, your own share (the number that is your spending), and what is owed to you, then
// one card per store that was bought from, saying who pays whom and letting you say who paid. Only shown once a sharing group exists.
export default function SplitSummary({ g, month, mk }: { g: Grocery; month: GroceryMonth; mk: string }) {
  const purchases = purchasesOf(g, month);
  if (!purchases.length) return null;
  const names = new Map(everyone(g).map(p => [p.id, p.n])); // people who are gone too: a past month still says who owed whom
  const pickable = new Map(allPeople(g).map(p => [p.id, p.n]));
  const optionsFor = (payer: string) => { const o = new Map(pickable); if (names.has(payer)) o.set(payer, names.get(payer)!); return [...o]; }; // the people you can pick, and the payer even when they are gone
  const who = (id: string) => (id === ME ? 'You' : names.get(id) ?? 'Someone');
  const { paid, yours } = monthShare(g, month);
  // Every store that was bought from gets a card, so "Paid by" can be set for one that only holds your own things too (someone else may have paid it).
  const cards = storesBought(g, purchases).map(store => ({ store, payer: payerOf(g, month, store), s: storeSettlement(g, month, store, purchases) }));
  const owed = monthOwed(g, month);
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
                {optionsFor(payer).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select>
            </label>
          </div>
          <ul className="gsplitrows">
            <li><span>Bill</span><span>{money(st.bill)}</span></li>
            {st.tax > 0 && <li><span>Includes tax</span><span>{money(st.tax)}</span></li>}
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
