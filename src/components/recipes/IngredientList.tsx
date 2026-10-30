import { useState } from 'react';
import { parseIngredientList } from '../../lib/ingredientList.js';

// Type a list (brief recipe-form-mobile-desktop): one ingredient per line, "or" starts an alternative, and what was read shows as you type.
// Use these ingredients turns the lines into rows; `onUse` answers with a message when it could not.
export default function IngredientList({ text, onText, onUse }: { text: string; onText: (t: string) => void; onUse: () => string }) {
  const [msg, setMsg] = useState('');
  const { rows, cut } = parseIngredientList(text);
  return (
    <div className="rc-list">
      <label>One ingredient per line. Write "or" for an alternative.
        <textarea rows={7} value={text} placeholder={'1 cup milk or oat milk\n1 tbsp honey\npinch salt'} onChange={e => { onText(e.target.value); setMsg(''); }} />
      </label>
      <div className="rc-preview" aria-label="What was read">
        {rows.length === 0 ? <p className="note">Nothing read yet.</p> : (
          <ul>{rows.map((r, i) => <li key={i}><span className="rc-pamt">{r.amt || 'no amount'}</span> {r.n}{r.sub && <span className="rc-instead"> or {r.sub}</span>}</li>)}</ul>
        )}
        {cut && <p className="note">Only the first {rows.length} are used.</p>}
      </div>
      {msg && <p className="note gerr" role="alert">{msg}</p>}
      <button type="button" className="btn" onClick={() => setMsg(onUse())}>Use these ingredients</button>
    </div>
  );
}
