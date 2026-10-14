import { useState, type FormEvent } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { byStore, centsText, emptyMonth, gotLast, lineOf, lineTotal, money, monthKey, monthLabel, onList, parseDollars, shiftMonth, storeChoices, tally } from '../../lib/grocery.js';
import ArmedButton from '../ArmedButton.jsx';
import RemovedNotice from '../RemovedNotice.jsx';
import type { Grocery as GroceryT, GroceryItem, GroceryMonth } from '../../types.ts';
import type { GroceryForm } from '../../store/types.ts';
import './Grocery.css';

// Two views (ADR 038): To get is this month's shopping list; At home is every item you buy, checked while you have it. Unchecking a
// When-out item there puts it on To get; ticking it bought on To get checks it again. Every-month items are always on To get.
type View = 'get' | 'home';
const EMPTY_FORM: GroceryForm = { n: '', store: '', qty: '1', price: '', every: false };

// A count or price box that keeps what is typed and saves when you leave it (or press Enter), so a half-typed "3." is not rewritten under you.
function NumBox({ label, value, onCommit, className }: { label: string; value: string; onCommit: (text: string) => boolean; className: string }) {
  const [text, setText] = useState(value); const [seen, setSeen] = useState(value); const [bad, setBad] = useState(false);
  if (value !== seen) { setSeen(value); setText(value); setBad(false); } // the saved value changed from elsewhere
  const commit = () => { if (text === value) return setBad(false); setBad(!onCommit(text)); };
  return (
    <input type="text" inputMode="decimal" className={`gnum ${className}`} aria-label={label} aria-invalid={bad || undefined} value={text}
      onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />
  );
}

/* ---------- To get ---------- */
// One line of the shopping list: the whole row ticks it, and the trailing "2 × $3.49" opens the count and price for this month.
function GetRow({ item, month, mk }: { item: GroceryItem; month: GroceryMonth; mk: string }) {
  const s = useAppStore.getState();
  const l = lineOf(item, month); const total = lineTotal(l.qty, l.cents);
  const [open, setOpen] = useState(false);
  const moreId = `groc-more-${item.id}`;
  return (
    <li className={`gget${l.got ? ' got' : ''}`}>
      <div className="ggetline">
        <label className="gtick">
          <input type="checkbox" className="chk" id={`groc-${item.id}`} checked={l.got} onChange={e => s.setGroceryGot(mk, item.id, e.target.checked)} />
          <span className="gtickname">{item.n}</span>
        </label>
        <button type="button" className="gqty" aria-expanded={open} aria-controls={moreId} aria-label={`Count and price of ${item.n}`} onClick={() => setOpen(v => !v)}>
          <span className="gpill">{l.qty} × {l.cents == null ? 'no price' : money(l.cents)}</span>
        </button>
      </div>
      {open && (
        <div className="gmore" id={moreId}>
          <label className="gfield">Count
            <NumBox label={`Count of ${item.n}`} className="gcount" value={String(l.qty)}
              onCommit={t => { const n = Number(t); if (!t.trim() || !Number.isFinite(n) || n <= 0 || n > 999) return false; s.setGroceryQty(mk, item.id, n); return true; }} />
          </label>
          <label className="gfield">Price each
            <NumBox label={`Price each of ${item.n}, dollars`} className="gprice" value={centsText(l.cents)}
              onCommit={t => { if (!t.trim()) { s.setGroceryCents(mk, item.id, null); return true; } const c = parseDollars(t); if (c == null) return false; s.setGroceryCents(mk, item.id, c); return true; }} />
          </label>
          <span className="gtotal" aria-label={`Total for ${item.n}`}>{l.cents == null ? '' : money(total)}</span>
          {!item.every && <button type="button" className="btn sm ghost gtake" aria-label={`Take ${item.n} off the list`} onClick={() => s.takeGroceryOff(mk, item.id)}>Take off the list</button>}
        </div>
      )}
    </li>
  );
}

function ToGet({ g, months, nowKey }: { g: GroceryT; months: Record<string, GroceryMonth>; nowKey: string }) {
  const [back, setBack] = useState(0);
  const mk = shiftMonth(nowKey, -back);
  const month = months[mk] || emptyMonth();
  const list = onList(g, month, back === 0); const t = tally(list, month);
  return (
    <>
      <div className="gmonth" role="group" aria-label="Month">
        <button type="button" className="btn sm" id="groc-prev" aria-label="Previous month" onClick={() => setBack(b => b + 1)}>‹</button>
        <b id="groc-month" role="status" aria-live="polite">{monthLabel(mk)}{back === 0 ? ' (this month)' : ''}</b>
        <button type="button" className="btn sm" id="groc-next" aria-label="Next month" disabled={back === 0} onClick={() => setBack(b => Math.max(0, b - 1))}>›</button>
      </div>
      <p className="note" id="groc-summary" role="status">
        {t.count ? `Got ${t.got} of ${t.count} · Spent ${money(t.spent)} · Expected ${money(t.planned)}${t.unpriced ? ` · ${t.unpriced} without a price` : ''}` : 'Nothing on this month’s list.'}
      </p>
      {!t.count && back === 0 && <p className="note">Uncheck what you’re out of on <b>At home</b> and it shows up here.</p>}
      {byStore(g, list).map((grp, gi) => {
        const gt = tally(grp.items, month);
        return (
          <section key={grp.store || '_'} className={`gstore${gt.got === gt.count ? ' done' : ''}`} aria-labelledby={`groc-h-${gi}`}>
            <div className="gstorehead">
              <h3 id={`groc-h-${gi}`}>{grp.label}</h3>
              <span className="note">{gt.got}/{gt.count}{gt.planned ? ` · ${money(gt.planned)}` : ''}</span>
            </div>
            <ul className="glist">{gotLast(grp.items, month).map(it => <GetRow key={it.id} item={it} month={month} mk={mk} />)}</ul>
          </section>
        );
      })}
    </>
  );
}

/* ---------- At home ---------- */
function HomeRow({ item }: { item: GroceryItem }) {
  const s = useAppStore.getState();
  return (
    <li className="ghome">
      {item.every
        ? <><span className="gtickname">{item.n}</span><span className="gchip">Every month</span></>
        : (
          <label className="gtick">
            <input type="checkbox" className="chk" id={`groc-have-${item.id}`} aria-label={`Have ${item.n}`} checked={!item.out} onChange={e => s.setGroceryOut(item.id, !e.target.checked)} />
            <span className="gtickname">{item.n}</span>
            {item.out && <span className="gchip out">On the list</span>}
          </label>
        )}
    </li>
  );
}

function EditRow({ item, g }: { item: GroceryItem; g: GroceryT }) {
  const s = useAppStore.getState();
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(item.n);
  const [arming, setArming] = useState(false); // Remove was pressed once
  const { mine, suggested } = storeChoices(g);
  return (
    <li className={`gedit${arming ? ' removing' : ''}`}>
      <input type="text" className="gname" aria-label={`Name of ${item.n}`} maxLength={80} value={name} onChange={e => setName(e.target.value)}
        onBlur={() => { if (name.trim() && name.trim() !== item.n) setErr(s.updateGroceryItem(item.id, { n: name })); else setName(item.n); }} />
      <select aria-label={`Store for ${item.n}`} value={item.store} onChange={e => setErr(s.updateGroceryItem(item.id, { store: e.target.value }))}>
        <option value="">Anywhere</option>
        {mine.map(x => <option key={x} value={x}>{x}</option>)}
        {suggested.length > 0 && <optgroup label="Suggested">{suggested.map(x => <option key={x} value={x}>{x}</option>)}</optgroup>}
      </select>
      <label className="gcheck"><input type="checkbox" className="chk" aria-label={`${item.n} every month`} checked={item.every} onChange={e => setErr(s.updateGroceryItem(item.id, { every: e.target.checked }))} /> Every month</label>
      <ArmedButton className={`btn sm ${arming ? 'danger' : 'ghost'}`} aria-label={`Remove ${item.n} from your list`} label="Remove" armedLabel="Tap again to remove" onArmedChange={setArming} onConfirm={() => s.removeGroceryItem(item.id)} />
      {err && <p className="note gerr" role="alert">{err}</p>}
    </li>
  );
}

function AddItem({ g }: { g: GroceryT }) {
  const [f, setF] = useState(EMPTY_FORM); const [err, setErr] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const m = useAppStore.getState().addGroceryItem(f);
    setErr(m); if (!m) setF({ ...EMPTY_FORM, store: f.store, every: f.every });
  };
  const { mine, suggested } = storeChoices(g);
  return (
    <form className="gform" onSubmit={submit} noValidate aria-label="Add an item">
      <h3>Add an item</h3>
      <div className="warmadd">
        <input type="text" id="groc-name" aria-label="Item name" placeholder="Item" maxLength={80} value={f.n} onChange={e => setF({ ...f, n: e.target.value })} />
        <input type="text" id="groc-store" aria-label="Store" placeholder="Store (optional)" maxLength={40} list="groc-stores" value={f.store} onChange={e => setF({ ...f, store: e.target.value })} />
        <datalist id="groc-stores">{[...mine, ...suggested].map(x => <option key={x} value={x} />)}</datalist>
        <input type="text" id="groc-qty" inputMode="decimal" aria-label="Count" placeholder="Count" value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })} />
        <input type="text" id="groc-price" inputMode="decimal" aria-label="Price each, dollars (optional)" placeholder="Price each" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} />
      </div>
      <label className="gcheck"><input type="checkbox" className="chk" id="groc-every" checked={f.every} onChange={e => setF({ ...f, every: e.target.checked })} /> Every month (else only when you’re out)</label>
      <div className="inline"><button type="submit" className="btn sm" id="groc-add" disabled={!f.n.trim()}>Add</button></div>
      {err && <p className="note" role="alert">{err}</p>}
    </form>
  );
}

function Stores({ g }: { g: GroceryT }) {
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

function AtHome({ g }: { g: GroceryT }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <div className="ghomehead">
        <p className="note">{editing ? 'Add, rename, move or remove what you buy.' : 'Uncheck what you’re out of: it goes on this month’s To get list.'}</p>
        <button type="button" className="btn sm ghost" id="groc-edit" aria-pressed={editing} onClick={() => setEditing(v => !v)}>{editing ? 'Done' : 'Edit'}</button>
      </div>
      <RemovedNotice scope="grocery" />
      {!g.items.length && !editing && <p className="note">Your list is empty. Use Edit to add what you buy and where.</p>}
      {byStore(g, g.items).map((grp, gi) => (
        <section key={grp.store || '_'} className="gstore" aria-labelledby={`groc-home-h-${gi}`}>
          <div className="gstorehead"><h3 id={`groc-home-h-${gi}`}>{grp.label}</h3></div>
          <ul className="glist">{grp.items.map(it => (editing ? <EditRow key={it.id} item={it} g={g} /> : <HomeRow key={it.id} item={it} />))}</ul>
        </section>
      ))}
      {editing && <AddItem g={g} />}
      {editing && <Stores g={g} />}
    </>
  );
}

export default function Grocery() {
  const g = useAppStore(s => s.grocery);
  const months = useAppStore(s => s.groceryMonths);
  const today = useToday(s => s.today);
  const [view, setView] = useState<View>(() => (g.items.length ? 'get' : 'home')); // nothing to get from an empty list: start where you add
  return (
    <section className="panel groc" aria-labelledby="groc-h">
      <div className="gtop">
        <h2 id="groc-h">Groceries</h2>
        <div className="seg" role="group" aria-label="Grocery view">
          <button type="button" id="groc-view-get" className={view === 'get' ? 'on' : ''} aria-pressed={view === 'get'} onClick={() => setView('get')}>To get</button>
          <button type="button" id="groc-view-home" className={view === 'home' ? 'on' : ''} aria-pressed={view === 'home'} onClick={() => setView('home')}>At home</button>
        </div>
      </div>
      {/* Device-only until it syncs (ADR 019, 038): say so, so nobody expects it on another device. */}
      <p className="notice" id="groc-local">On this device only, not synced yet. <b>Export all data</b> in Settings keeps a copy.</p>
      {view === 'get' ? <ToGet g={g} months={months} nowKey={monthKey(today)} /> : <AtHome g={g} />}
    </section>
  );
}
