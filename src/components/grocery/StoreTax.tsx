import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { parseTaxPercent, taxText } from '../../lib/groceryTax.js';
import './StoreTax.css';

// A store's sales tax while editing: a Tax checkbox, and once it is ticked the rate in percent (8.875). The rate saves when you leave the box or
// press Enter; unticking clears it. The tax is added to what you buy at that store, so the totals match the receipt.
export default function StoreTax({ store, rate, onError }: { store: string; rate: number | undefined; onError: (msg: string | null) => void }) {
  const [on, setOn] = useState(!!rate);
  const [text, setText] = useState(taxText(rate));
  const save = () => {
    if (!on) return;
    const r = parseTaxPercent(text);
    if (r == null) { onError(text.trim() ? 'Tax is a percent from 0.001 to 30, like 8.875.' : null); if (!text.trim() && !rate) return; setText(taxText(rate)); return; }
    onError(useAppStore.getState().setGroceryStoreTax(store, r)); setText(taxText(r));
  };
  return (
    <span className="gtaxset">
      <label className="gtaxchk">
        <input type="checkbox" className="chk" checked={on} aria-label={`Charges tax at ${store}`}
          onChange={e => { setOn(e.target.checked); if (!e.target.checked) { setText(''); onError(useAppStore.getState().setGroceryStoreTax(store, null)); } }} /> Tax
      </label>
      {on && (
        <label className="gtaxrate">
          <input type="text" inputMode="decimal" aria-label={`Tax rate at ${store}, percent`} placeholder="8.875" maxLength={6} value={text} autoFocus={!rate}
            onChange={e => setText(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} /> %
        </label>
      )}
    </span>
  );
}
