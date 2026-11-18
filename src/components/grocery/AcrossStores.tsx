import type { MonthPurchase } from '../../lib/grocerySettle.js';
import { money } from '../../lib/grocery.js';
import { acrossPeople, acrossStores } from '../../lib/groceryAcrossStores.js';
import type { Grocery, GroceryMonth } from '../../types.ts';
import './AcrossStores.css';

// One amount per person over every store bought from this month, above the store cards (which stay as they are). Read only: the Mark paid buttons are on the cards.
export default function AcrossStores({ g, month, purchases }: { g: Grocery; month: GroceryMonth; purchases?: readonly MonthPurchase[] }) {
  const a = acrossStores(g, month, purchases);
  const t = acrossPeople(g, month, purchases); // everyone's month: the same gate, but it still shows when nobody owes you anything
  if (!a && !t) return null;
  const say = (name: string, cents: number) => (cents > 0 ? `${name} owes you` : cents < 0 ? `You owe ${name}` : `${name} and you are even`);
  return (
    <section className="gacross" aria-label="Across all stores">
      {a && <>
      <h4>Across all stores</h4>
      <ul className="gacrossrows">
        {a.people.map(p => (
          <li key={p.id}>
            <span>{say(p.name, p.cents)}<small>{p.parts.map(x => `${x.store || 'Anywhere'} ${x.cents < 0 ? '−' : ''}${money(Math.abs(x.cents))}`).join(', ')}</small></span>
            <b>{p.cents === 0 ? 'Even' : money(Math.abs(p.cents))}</b>
          </li>
        ))}
      </ul>
      <p className="gacrossnet">{a.net === 0 ? 'Even overall' : <>Net <b>{money(Math.abs(a.net))}</b> {a.net > 0 ? 'owed to you' : 'you owe'}</>}</p>
      </>}
      {t && (
        <table className="gacrosstable">
          <caption>Everyone across all stores</caption>
          <thead><tr><th scope="col">Person</th><th scope="col">Paid</th><th scope="col">Share</th></tr></thead>
          <tbody>
            {t.people.map(p => <tr key={p.id}><th scope="row">{p.name}</th><td>{money(p.paid)}</td><td>{money(p.share)}</td></tr>)}
            <tr className="gacrosstotal"><th scope="row">All</th><td>{money(t.paid)}</td><td>{money(t.share)}</td></tr>
          </tbody>
        </table>
      )}
      {t && <p className="gacrossnote">Share is what each person's items and tax come to, less any rewards credit, over all stores. Mark paid does not change it.</p>}
    </section>
  );
}
