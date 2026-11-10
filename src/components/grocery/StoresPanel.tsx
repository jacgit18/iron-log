import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import ArmedButton from '../ArmedButton.jsx';
import RemovedNotice from '../RemovedNotice.jsx';
import type { Grocery as GroceryT } from '../../types.ts';

export default function Stores({ g }: { g: GroceryT }) {
  const [name, setName] = useState(''); const [err, setErr] = useState<string | null>(null);
  const [arming, setArming] = useState<string | null>(null); // the store whose Remove was pressed once
  const s = useAppStore.getState();
  return (
    <section className="gform" aria-labelledby="groc-stores-h">
      <h3 id="groc-stores-h">Stores</h3>
      <RemovedNotice scope="grocerystores" />
      {!g.stores.length && <p className="note">No stores yet. Adding an item with a store creates it.</p>}
      <ul className="glist">
        {g.stores.map(x => (
          <li key={x} className={`gstoreline${arming === x ? ' removing' : ''}`}>
            <span className="rmname">{x}</span>
            <ArmedButton className={`btn sm ${arming === x ? 'danger' : 'ghost'}`} aria-label={`Remove the store ${x}`} label="Remove" armedLabel="Tap again to remove" onArmedChange={a => setArming(a ? x : null)} onConfirm={() => { setArming(null); setErr(s.removeGroceryStore(x)); }} />
          </li>
        ))}
      </ul>
      <form className="warmadd" noValidate onSubmit={e => { e.preventDefault(); const m = s.addGroceryStore(name); setErr(m); if (!m) setName(''); }}>
        <input type="text" aria-label="New store" placeholder="New store" maxLength={40} value={name} onChange={e => setName(e.target.value)} />
        <button type="submit" className="btn sm" disabled={!name.trim()}>Add store</button>
      </form>
      {err && <p className="note" role="alert">{err}</p>}
    </section>
  );
}
