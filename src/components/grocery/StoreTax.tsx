import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { centsText, money, parseDollars } from '../../lib/grocery.js';
import { taxPercentText } from '../../lib/groceryTax.js';
import './StoreTax.css';

// The sales tax a store's receipt shows for this month, typed in dollars (Tax checkbox, then the amount). It is added to what you spent there, so
// the totals match the receipt. The percent beside it is only what the amount comes to on the ticked items, to show it looks right.
export default function StoreTax({ mk, store, cents, subtotal, onError }: { mk: string; store: string; cents: number | undefined; subtotal: number; onError?: (msg: string | null) => void }) {
  const [on, setOn] = useState(!!cents);
  const [text, setText] = useState(centsText(cents ?? null));
  const [err, setErr] = useState<string | null>(null);
  const set = (msg: string | null) => { setErr(msg); onError?.(msg); };
  const save = () => {
    if (!on) return;
    if (!text.trim()) { if (cents) useAppStore.getState().setGroceryTax(mk, store, null); set(null); return; }
    const c = parseDollars(text);
    if (c == null || c <= 0) { set('Tax is dollars, like 2.22.'); setText(centsText(cents ?? null)); return; }
    set(null); useAppStore.getState().setGroceryTax(mk, store, c); setText(centsText(c));
  };
  const pct = taxPercentText(cents ?? 0, subtotal);
  return (
    <div className="gtaxset">
      <label className="gtaxchk">
        <input type="checkbox" className="chk" checked={on} aria-label={`Tax at ${store} this month`}
          onChange={e => { setOn(e.target.checked); if (!e.target.checked) { setText(''); set(null); if (cents) useAppStore.getState().setGroceryTax(mk, store, null); } }} /> Tax
      </label>
      {on && (
        <label className="gtaxamt">$
          <input type="text" inputMode="decimal" aria-label={`Tax at ${store}, dollars, from the receipt`} placeholder="0.00" maxLength={9} value={text} autoFocus={!cents}
            onChange={e => setText(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} />
        </label>
      )}
      {on && pct && <span className="note gtaxpct">{pct} of {money(subtotal)}</span>}
      {err && <span className="note gerr" role="alert">{err}</span>}
    </div>
  );
}
