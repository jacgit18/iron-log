import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { centsText, money, parseDollars } from '../../lib/grocery.js';
import { taxPercentText } from '../../lib/groceryTax.js';
import './StoreTax.css';

// The sales tax a store's receipt shows for this month, typed in dollars (Tax checkbox, then the amount), and beside it the rewards credit the receipt took off (Rewards
// checkbox, then the amount; brief receipt-rewards-credit). Tax is added to what you spent there and Rewards taken off, so the totals match what the card was charged.
// The percent beside the tax is only what the amount comes to on the ticked items, to show it looks right.
interface BoxProps { label: 'Tax' | 'Rewards'; store: string; cents: number | undefined; write: (c: number | null) => void; bad: string; onError?: (msg: string | null) => void; note?: string | null }

function MoneyBox({ label, store, cents, write, bad, onError, note }: BoxProps) {
  const [on, setOn] = useState(!!cents);
  const [text, setText] = useState(centsText(cents ?? null));
  const [err, setErr] = useState<string | null>(null);
  // The amount can change somewhere else (another device through sync, another tab, Add to my data): take that value, so the box never disagrees with the totals.
  const [seen, setSeen] = useState(cents);
  if (cents !== seen) { setSeen(cents); setOn(!!cents); setText(centsText(cents ?? null)); setErr(null); }
  const set = (msg: string | null) => { setErr(msg); onError?.(msg); };
  const save = () => {
    if (!on) return;
    if (!text.trim()) { if (cents) write(null); set(null); return; }
    const c = parseDollars(text);
    if (c == null || c <= 0) { set(bad); setText(centsText(cents ?? null)); return; }
    set(null); write(c); setText(centsText(c));
  };
  const lower = label.toLowerCase();
  return (
    <div className="gtaxset">
      <label className="gtaxchk">
        <input type="checkbox" className="chk" checked={on} aria-label={`${label} at ${store} this month`}
          onChange={e => { setOn(e.target.checked); if (!e.target.checked) { setText(''); set(null); if (cents) write(null); } }} /> {label}
      </label>
      {on && (
        <label className="gtaxamt">$
          <input type="text" inputMode="decimal" aria-label={`${label} at ${store}, dollars, from the receipt`} placeholder="0.00" maxLength={9} value={text} autoFocus={!cents}
            onChange={e => setText(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} data-box={lower} />
        </label>
      )}
      {on && note && <span className="note gtaxpct">{note}</span>}
      {err && <span className="note gerr" role="alert">{err}</span>}
    </div>
  );
}

export default function StoreTax({ mk, store, cents, credit, subtotal, onError }: { mk: string; store: string; cents: number | undefined; credit?: number | undefined; subtotal: number; onError?: (msg: string | null) => void }) {
  const pct = taxPercentText(cents ?? 0, subtotal);
  return (
    <div className="gtaxrow">
      <MoneyBox label="Tax" store={store} cents={cents} bad="Tax is dollars, like 2.22." onError={onError} write={c => useAppStore.getState().setGroceryTax(mk, store, c)} note={pct ? `${pct} of ${money(subtotal)}` : null} />
      <MoneyBox label="Rewards" store={store} cents={credit} bad="Rewards is dollars, like 17.27." onError={onError} write={c => useAppStore.getState().setGroceryCredit(mk, store, c)} />
    </div>
  );
}
