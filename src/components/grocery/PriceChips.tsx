import { useState, type FormEvent } from 'react';
import { MAX_PRICES, money, parsePrices } from '../../lib/grocery.js';
import Icon from '../Icon.jsx';
import './PriceChips.css';

// The price of each one bought, as chips you can remove, with a box that adds one (or several typed together: "8.99, 10.49"). Used when
// the things you buy cost different amounts, like packs of beef. An empty list goes back to one count and one price.
export default function PriceChips({ name, prices, onChange }: { name: string; prices: number[] | undefined; onChange: (prices: number[] | null) => void }) {
  const [text, setText] = useState(''); const [bad, setBad] = useState(false);
  const list = prices ?? [];
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const p = parsePrices(text);
    if (!p || list.length + p.length > MAX_PRICES) { setBad(true); return; }
    setBad(false); setText(''); onChange([...list, ...p]);
  };
  const remove = (i: number) => { const next = list.filter((_, k) => k !== i); onChange(next.length ? next : null); };
  return (
    <div className="gchips" role="group" aria-label={`Price of each ${name}`}>
      <span className="gchipslab">Prices, if they differ</span>
      {list.length > 0 && (
        <ul className="gchiplist">
          {list.map((c, i) => (
            <li key={i}><button type="button" className="gchipbtn" aria-label={`Remove ${money(c)} from ${name}`} onClick={() => remove(i)}>{money(c)}<Icon name="close" /></button></li>
          ))}
        </ul>
      )}
      <form className="gchipadd" noValidate onSubmit={add}>
        <input type="text" inputMode="decimal" className="gchipin" aria-label={`Add a price for ${name}, dollars`} aria-invalid={bad || undefined} placeholder="Add a price, like 8.99"
          value={text} onChange={e => { setText(e.target.value); setBad(false); }} />
        <button type="submit" className="btn sm" disabled={!text.trim()}>Add price</button>
      </form>
      {bad && <p className="note gerr" role="alert">Prices are dollars, like 8.99 (up to {MAX_PRICES}).</p>}
    </div>
  );
}
