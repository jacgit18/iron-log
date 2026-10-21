import { useAppStore } from '../../store/useAppStore.js';
import { money } from '../../lib/grocery.js';
import { allPeople, monthOwed, monthShare, payerOf, purchasesOf, storeSettlement, storesBought } from '../../lib/grocerySettle.js';
import { ME } from '../../lib/grocerySplit.js';
import { monthOwes, storeStatus, type RowStatus } from '../../lib/grocerySettle.js';
import type { Grocery, GroceryMonth } from '../../types.ts';
import './SplitSummary.css';

// What a month's shared groceries come to: what you paid, your own share (the number that is your spending), and what is owed to you, then
// one card per store that was bought from, saying who pays whom, letting you say who paid, and letting you mark each owed amount settled once the money has
// moved outside the app (ADR 062); the amounts never change, a mark only moves a row between outstanding and settled. Only shown once a sharing group exists.
export default function SplitSummary({ g, month, mk }: { g: Grocery; month: GroceryMonth; mk: string }) {
  const purchases = purchasesOf(g, month);
  if (!purchases.length) return null;
  const names = new Map(allPeople(g).map(p => [p.id, p.n]));
  const who = (id: string) => (id === ME ? 'You' : names.get(id) ?? 'Someone');
  const { paid, yours } = monthShare(g, month);
  // Every store that was bought from gets a card, so "Paid by" can be set for one that only holds your own things too (someone else may have paid it).
  const cards = storesBought(g, purchases).map(store => ({ store, payer: payerOf(g, month, store), s: storeSettlement(g, month, store, purchases), t: storeStatus(g, month, store, purchases) }));
  const { owed, youOwe } = monthOwes(g, month);
  const s = useAppStore.getState();
  // What a row says, before and after it is settled. A person marked Share already paid reads "already paid" until you say Not paid.
  const say = (r: RowStatus, payer: string) => {
    const w = who(r.id);
    if (r.kind === 'youOwe') return r.paid ? `You sent ${w}` : `You owe ${w}`;
    if (r.kind === 'owesPayer') return r.paid ? `${w} paid ${who(payer)}` : `${w} owes ${who(payer)}`;
    return r.paid ? (r.auto ? `${w}, already paid` : `${w} paid you`) : `${w} owes you`;
  };
  return (
    <section className="gsplit" aria-labelledby={`groc-split-h-${mk}`}>
      <h3 id={`groc-split-h-${mk}`}>Splitting this month</h3>
      <dl className="gsplitsum">
        <div><dt>Paid</dt><dd>{money(paid)}</dd></div>
        <div><dt>Your share</dt><dd>{money(yours)}</dd></div>
        <div><dt>Still owed to you</dt><dd className={owed ? 'gowed' : undefined}>{money(owed)}</dd></div>
        {youOwe > 0 && <div><dt>You still owe</dt><dd>{money(youOwe)}</dd></div>}
      </dl>
      {cards.map(({ store, payer, s: st, t }) => (
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
            {st.tax > 0 && <li><span>Includes tax</span><span>{money(st.tax)}</span></li>}
            <li><span>Your share</span><span>{money(st.yourShare)}</span></li>
            {t.rows.map(r => {
              const text = r.paid ? (r.auto ? 'Not paid' : 'Undo') : r.kind === 'youOwe' ? 'Mark as sent' : 'Mark paid';
              return (
                <li key={r.id + r.kind} className={`${(r.kind === 'owesYou' || r.kind === 'youOwe') && !r.paid ? 'act' : ''}${r.paid ? ' settled' : ''}`.trim() || undefined}>
                  <span className="gsplitsay">{say(r, payer)}{r.paid && <small className="gsplitok">{r.auto ? 'Share already paid' : 'Paid'}</small>}</span>
                  <span>{money(r.cents)}</span>
                  <button type="button" className="btn sm ghost gsplitbtn" aria-label={`${text}: ${say(r, payer)} ${money(r.cents)}`} onClick={() => s.setGroceryPaid(mk, store, r.id, !r.paid)}>{text}</button>
                </li>
              );
            })}
          </ul>
          {t.rows.some(r => r.kind !== 'owesPayer') && (
            <p className="gsplitfoot">{t.outstanding > 0 ? <>Outstanding <b>{money(t.outstanding)}</b></> : <span className="gsettled">All settled</span>}</p>
          )}
        </div>
      ))}
    </section>
  );
}
