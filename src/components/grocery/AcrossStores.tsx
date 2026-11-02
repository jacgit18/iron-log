import { money } from '../../lib/grocery.js';
import { acrossStores } from '../../lib/groceryAcrossStores.js';
import type { Grocery, GroceryMonth } from '../../types.ts';
import './AcrossStores.css';

// One amount per person over every store bought from this month, above the store cards (which stay as they are). Read only: the Mark paid buttons are on the cards.
export default function AcrossStores({ g, month }: { g: Grocery; month: GroceryMonth }) {
  const a = acrossStores(g, month);
  if (!a) return null;
  const say = (name: string, cents: number) => (cents > 0 ? `${name} owes you` : cents < 0 ? `You owe ${name}` : `${name} and you are even`);
  return (
    <section className="gacross" aria-label="Across all stores">
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
    </section>
  );
}
