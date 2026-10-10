import { useState, type FormEvent } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { centsText, emptyMonth, lineOf, lineTotal, money, monthKey, monthLabel, occasional, onList, byStore, parseDollars, shiftMonth, tally } from '../../lib/grocery.js';
import type { Grocery as GroceryT, GroceryItem, GroceryMonth } from '../../types.ts';

const EMPTY_FORM = { n: '', store: '', qty: '1', price: '', once: false };

// A count or price box that keeps what is typed and saves when you leave it (or press Enter), so a half-typed "3." is not rewritten under you.
function NumBox({ label, value, onCommit, inputMode, width }: { label: string; value: string; onCommit: (text: string) => boolean; inputMode: 'decimal' | 'numeric'; width: string }) {
  const [text, setText] = useState(value); const [seen, setSeen] = useState(value); const [bad, setBad] = useState(false);
  if (value !== seen) { setSeen(value); setText(value); setBad(false); } // the saved value changed from elsewhere
  const commit = () => { if (text === value) return setBad(false); setBad(!onCommit(text)); };
  return (
    <input type="text" inputMode={inputMode} className="gnum" style={{ width }} aria-label={label} aria-invalid={bad || undefined} value={text}
      onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />
  );
}

function Row({ item, month, mk, editing, g }: { item: GroceryItem; month: GroceryMonth; mk: string; editing: boolean; g: GroceryT }) {
  const s = useAppStore.getState();
  const l = lineOf(item, month); const total = lineTotal(l.qty, l.cents);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(item.n);
  return (
    <div className={`warmrow grow${l.got ? ' idone' : ''}`}>
      <label className="exname">
        <input type="checkbox" className="chk" id={`groc-${item.id}`} checked={l.got} aria-label={editing ? `Got ${item.n}` : undefined} onChange={e => s.setGroceryGot(mk, item.id, e.target.checked)} />{' '}
        {editing ? null : <>{item.n}{item.once && <span className="rx"> · occasional</span>}</>}
      </label>
      {editing && (
        <input type="text" className="gname" aria-label={`Name of ${item.n}`} maxLength={80} value={name} onChange={e => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name.trim() !== item.n) setErr(s.updateGroceryItem(item.id, { n: name })); else setName(item.n); }} />
      )}
      <span className="inline gnums">
        <NumBox label={`Count of ${item.n}`} inputMode="decimal" width="4.2em" value={String(l.qty)}
          onCommit={t => { const n = Number(t); if (!t.trim() || !Number.isFinite(n) || n <= 0 || n > 999) return false; s.setGroceryQty(mk, item.id, n); return true; }} />
        <span aria-hidden="true">×</span>
        <NumBox label={`Price each of ${item.n}, dollars`} inputMode="decimal" width="5.2em" value={centsText(l.cents)}
          onCommit={t => { if (!t.trim()) { s.setGroceryCents(mk, item.id, null); return true; } const c = parseDollars(t); if (c == null) return false; s.setGroceryCents(mk, item.id, c); return true; }} />
        <span className="note gtotal" aria-label={`Total for ${item.n}`}>{l.cents == null ? '' : money(total)}</span>
      </span>
      {item.once && !editing && <button type="button" className="btn sm ghost" aria-label={`Take ${item.n} off this month`} onClick={() => s.pullGrocery(mk, item.id, false)}>Take off</button>}
      {editing && (
        <span className="inline" style={{ flexWrap: 'wrap' }}>
          <select aria-label={`Store for ${item.n}`} value={item.store} onChange={e => setErr(s.updateGroceryItem(item.id, { store: e.target.value }))}>
            <option value="">Anywhere</option>
            {g.stores.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <label className="gcheck"><input type="checkbox" className="chk" checked={item.once} onChange={e => s.updateGroceryItem(item.id, { once: e.target.checked })} /> Occasional</label>
          <button type="button" className="btn sm ghost" aria-label={`Remove ${item.n} from your list`} onClick={() => s.removeGroceryItem(item.id)}>Remove</button>
        </span>
      )}
      {err && <p className="note" role="alert" style={{ flexBasis: '100%' }}>{err}</p>}
    </div>
  );
}

function AddItem({ g }: { g: GroceryT }) {
  const [f, setF] = useState(EMPTY_FORM); const [err, setErr] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const m = useAppStore.getState().addGroceryItem(f);
    setErr(m); if (!m) setF({ ...EMPTY_FORM, store: f.store });
  };
  return (
    <form className="card" onSubmit={submit} noValidate aria-label="Add an item">
      <h3 className="exh"><b>Add an item</b></h3>
      <div className="warmadd">
        <input type="text" id="groc-name" aria-label="Item name" placeholder="Item" maxLength={80} value={f.n} onChange={e => setF({ ...f, n: e.target.value })} />
        <input type="text" id="groc-store" aria-label="Store" placeholder="Store (optional)" maxLength={40} list="groc-stores" value={f.store} onChange={e => setF({ ...f, store: e.target.value })} />
        <datalist id="groc-stores">{g.stores.map(x => <option key={x} value={x} />)}</datalist>
        <input type="text" id="groc-qty" inputMode="decimal" aria-label="Count" placeholder="Count" value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })} />
        <input type="text" id="groc-price" inputMode="decimal" aria-label="Price each, dollars (optional)" placeholder="Price each" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} />
      </div>
      <label className="gcheck"><input type="checkbox" className="chk" id="groc-once" checked={f.once} onChange={e => setF({ ...f, once: e.target.checked })} /> Occasional (not on every month’s list)</label>
      <div className="inline"><button type="submit" className="btn sm" id="groc-add" disabled={!f.n.trim()}>Add</button></div>
      {err && <p className="note" role="alert">{err}</p>}
    </form>
  );
}

function Stores({ g }: { g: GroceryT }) {
  const [name, setName] = useState(''); const [err, setErr] = useState<string | null>(null);
  const s = useAppStore.getState();
  return (
    <section className="card" aria-label="Stores">
      <h3 className="exh"><b>Stores</b></h3>
      {!g.stores.length && <p className="note">No stores yet. Adding an item with a store creates it.</p>}
      {g.stores.map(x => (
        <div key={x} className="warmrow">
          <span>{x}</span>
          <button type="button" className="btn sm ghost" aria-label={`Remove the store ${x}`} onClick={() => setErr(s.removeGroceryStore(x))}>Remove</button>
        </div>
      ))}
      <form className="warmadd" noValidate onSubmit={e => { e.preventDefault(); const m = s.addGroceryStore(name); setErr(m); if (!m) setName(''); }}>
        <input type="text" aria-label="New store" placeholder="New store" maxLength={40} value={name} onChange={e => setName(e.target.value)} />
        <button type="submit" className="btn sm" disabled={!name.trim()}>Add store</button>
      </form>
      {err && <p className="note" role="alert">{err}</p>}
    </section>
  );
}

export default function Grocery() {
  const g = useAppStore(s => s.grocery);
  const months = useAppStore(s => s.groceryMonths);
  const today = useToday(s => s.today);
  const [back, setBack] = useState(0); const [editing, setEditing] = useState(false);
  const s = useAppStore.getState();
  const nowKey = monthKey(today); const mk = shiftMonth(nowKey, -back);
  const month = months[mk] || emptyMonth();
  const list = onList(g, month); const t = tally(list, month);
  const later = occasional(g, month);
  const groups = byStore(g, list);
  return (
    <section className="panel" aria-labelledby="groc-h">
      <div className="inline" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h2 id="groc-h">Groceries</h2>
        <button type="button" className="btn sm ghost" id="groc-edit" aria-pressed={editing} onClick={() => setEditing(v => !v)}>{editing ? 'Done' : 'Edit'}</button>
      </div>
      <div className="inline" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }} role="group" aria-label="Month">
        <button type="button" className="btn sm" id="groc-prev" aria-label="Previous month" onClick={() => setBack(b => b + 1)}>‹</button>
        <b id="groc-month" role="status" aria-live="polite">{monthLabel(mk)}{back === 0 ? ' (this month)' : ''}</b>
        <button type="button" className="btn sm" id="groc-next" aria-label="Next month" disabled={back === 0} onClick={() => setBack(b => Math.max(0, b - 1))}>›</button>
      </div>
      <p className="note" id="groc-summary" role="status">
        {t.count ? `Got ${t.got} of ${t.count} · Spent ${money(t.spent)} · Expected ${money(t.planned)}${t.unpriced ? ` · ${t.unpriced} without a price` : ''}` : 'Nothing on this month’s list.'}
      </p>
      {!g.items.length && !editing && <p className="note">Your list is empty. Use Edit to add what you buy and where. Each month starts again with the same items, ticked off fresh.</p>}
      {groups.map((grp, gi) => {
        const gt = tally(grp.items, month);
        return (
          <div key={grp.store || '_'} className={`card${gt.count && gt.got === gt.count ? ' done' : ''}`} role="group" aria-labelledby={`groc-h-${gi}`}>
            <div className="warmhead">
              <h3 id={`groc-h-${gi}`} className="exh"><b>{grp.label}</b></h3>
              <span className="note">{gt.got}/{gt.count}{gt.planned ? ` · ${money(gt.planned)}` : ''}</span>
            </div>
            {grp.items.map(it => <Row key={it.id} item={it} month={month} mk={mk} editing={editing} g={g} />)}
          </div>
        );
      })}
      {later.length > 0 && (
        <div className="card" role="group" aria-labelledby="groc-later-h">
          <h3 id="groc-later-h" className="exh"><b>Occasional</b></h3>
          <p className="note">Not on each month’s list. Add one when you need it.</p>
          {later.map(it => (
            <div key={it.id} className="warmrow">
              <span>{it.n}{it.store && <span className="rx"> · {it.store}</span>}</span>
              <span className="inline">
                {editing && <button type="button" className="btn sm ghost" aria-label={`Remove ${it.n} from your list`} onClick={() => s.removeGroceryItem(it.id)}>Remove</button>}
                <button type="button" className="btn sm" aria-label={`Add ${it.n} to this month`} onClick={() => s.pullGrocery(mk, it.id, true)}>Add to this month</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {editing && <AddItem g={g} />}
      {editing && <Stores g={g} />}
    </section>
  );
}
