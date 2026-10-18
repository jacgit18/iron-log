import { useRef, useState, type FormEvent } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { MAX_NOTE, UNITS, byStore, centsText, emptyMonth, gotLast, lineOf, lineTotal, money, monthKey, monthLabel, onList, parseDollars, shiftMonth, storeChoices, tally, unitWords } from '../../lib/grocery.js';
import ArmedButton from '../ArmedButton.jsx';
import Icon from '../Icon.jsx';
import RemovedNotice from '../RemovedNotice.jsx';
import GrocerySpend from './GrocerySpend.js';
import useDockHeight from './useDockHeight.js';
import type { Grocery as GroceryT, GroceryItem, GroceryMonth, GroceryUnit } from '../../types.ts';
import type { GroceryForm } from '../../store/types.ts';
import './Grocery.css';

// Two views (ADR 038): To get is this month's shopping list; At home is every item you buy, checked while you have it. Unchecking a
// When-out item there puts it on To get; ticking it bought on To get checks it again. Every-month items are always on To get.
type View = 'get' | 'home' | 'spend';
const EMPTY_FORM: GroceryForm = { n: '', store: '', qty: '1', price: '', every: false, note: '', unit: '' };
const AHEAD = 12; // how many months past this one you can plan

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
function GetRow({ item, month, mk, future }: { item: GroceryItem; month: GroceryMonth; mk: string; future: boolean }) {
  const s = useAppStore.getState();
  const l = lineOf(item, month); const total = lineTotal(l.qty, l.cents); const w = unitWords(item.unit);
  const [open, setOpen] = useState(false);
  const moreId = `groc-more-${item.id}`;
  return (
    <li className={`gget${l.got ? ' got' : ''}`}>
      <div className="ggetline">
        <label className="gtick">
          <input type="checkbox" className="chk" id={`groc-${item.id}`} checked={l.got} disabled={future} onChange={e => s.setGroceryGot(mk, item.id, e.target.checked)} />
          <span className="gtickname">{item.n}{item.note && <small className="gnote">{item.note}</small>}</span>
        </label>
        <button type="button" className="gqty" aria-expanded={open} aria-controls={moreId} aria-label={`${w.count} and price of ${item.n}`} onClick={() => setOpen(v => !v)}>
          <span className="gpill">{w.qty(l.qty)} × {l.cents == null ? 'no price' : `${money(l.cents)}${w.per}`}</span>
        </button>
      </div>
      {open && (
        <div className="gmore" id={moreId}>
          <label className="gfield">{w.count}
            <NumBox label={`${w.count} of ${item.n}`} className="gcount" value={String(l.qty)}
              onCommit={t => { const n = Number(t); if (!t.trim() || !Number.isFinite(n) || n <= 0 || n > 999) return false; s.setGroceryQty(mk, item.id, n); return true; }} />
          </label>
          <label className="gfield">{w.price}
            <NumBox label={`${w.price} of ${item.n}, dollars`} className="gprice" value={centsText(l.cents)}
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
  const [off, setOff] = useState(0); // months from this one: below 0 is history, above 0 is planning ahead
  const mk = shiftMonth(nowKey, off);
  const month = months[mk] || emptyMonth();
  const list = onList(g, month, off === 0); const t = tally(list, month);
  return (
    <>
      <div className="gmonth" role="group" aria-label="Month">
        <button type="button" className="btn sm" id="groc-prev" aria-label="Previous month" onClick={() => setOff(o => o - 1)}><Icon name="chevron-left" /></button>
        <b id="groc-month" role="status" aria-live="polite">{monthLabel(mk)}{off === 0 ? ' (this month)' : off > 0 ? ' (ahead)' : ''}</b>
        <button type="button" className="btn sm" id="groc-next" aria-label="Next month" disabled={off >= AHEAD} onClick={() => setOff(o => Math.min(AHEAD, o + 1))}><Icon name="chevron-right" /></button>
      </div>
      <p className="note" id="groc-summary" role="status">
        {t.count ? `Got ${t.got} of ${t.count} · Spent ${money(t.spent)} · Expected ${money(t.planned)}${t.unpriced ? ` · ${t.unpriced} without a price` : ''}` : off > 0 ? 'Only your Every-month items are planned so far. Ticking opens when the month starts.' : 'Nothing on this month’s list.'}
      </p>
      {!t.count && off === 0 && <p className="note">Untick an item on <b>At home</b> when you run out and it shows up here.</p>}
      {byStore(g, list).map((grp, gi) => {
        const gt = tally(grp.items, month);
        return (
          <section key={grp.store || '_'} className={`gstore${gt.got === gt.count ? ' done' : ''}`} aria-labelledby={`groc-h-${gi}`}>
            <div className="gstorehead">
              <h3 id={`groc-h-${gi}`}>{grp.label}</h3>
              <span className="note">{gt.got}/{gt.count}{gt.planned ? ` · ${money(gt.planned)}` : ''}</span>
            </div>
            <ul className="glist">{gotLast(grp.items, month).map(it => <GetRow key={it.id} item={it} month={month} mk={mk} future={off > 0} />)}</ul>
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
        ? <><span className="gtickname">{item.n}{item.note && <small className="gnote">{item.note}</small>}</span><span className="gchip">Every month</span></>
        : (
          <label className="gtick">
            <input type="checkbox" className="chk" id={`groc-have-${item.id}`} aria-label={`Have ${item.n}`} checked={!item.out} onChange={e => s.setGroceryOut(item.id, !e.target.checked)} />
            <span className="gtickname">{item.n}{item.note && <small className="gnote">{item.note}</small>}</span>
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
      {!item.every && <input type="checkbox" className="chk gedithave" aria-label={`Have ${item.n}`} checked={!item.out} onChange={e => s.setGroceryOut(item.id, !e.target.checked)} />}
      <input type="text" className="gname" aria-label={`Name of ${item.n}`} maxLength={80} value={name} onChange={e => setName(e.target.value)}
        onBlur={() => { if (name.trim() && name.trim() !== item.n) setErr(s.updateGroceryItem(item.id, { n: name })); else setName(item.n); }} />
      <div className="gedrow">
        <input type="text" className="gnoteinput" aria-label={`Note for ${item.n}`} placeholder="Note (optional)" maxLength={MAX_NOTE} key={item.note ?? ''} defaultValue={item.note ?? ''}
          onBlur={e => { if (e.target.value.trim() !== (item.note ?? '')) setErr(s.updateGroceryItem(item.id, { note: e.target.value })); }} />
        <select aria-label={`Store for ${item.n}`} value={item.store} onChange={e => setErr(s.updateGroceryItem(item.id, { store: e.target.value }))}>
          <option value="">Anywhere</option>
          {mine.map(x => <option key={x} value={x}>{x}</option>)}
          {suggested.length > 0 && <optgroup label="Suggested">{suggested.map(x => <option key={x} value={x}>{x}</option>)}</optgroup>}
        </select>
      </div>
      <select className="gunit" aria-label={`Sold by, for ${item.n}`} value={item.unit ?? ''} onChange={e => setErr(s.updateGroceryItem(item.id, { unit: e.target.value as GroceryUnit | '' }))}>
        <option value="">Each</option>
        {UNITS.map(u => <option key={u} value={u}>by the {u}</option>)}
      </select>
      <label className="gcheck"><input type="checkbox" className="chk" aria-label={`${item.n} every month`} checked={item.every} onChange={e => setErr(s.updateGroceryItem(item.id, { every: e.target.checked }))} /> Every month</label>
      <ArmedButton className={`btn sm ${arming ? 'danger' : 'ghost'}`} aria-label={`Remove ${item.n} from your list`} label="Remove" armedLabel="Tap again to remove" onArmedChange={setArming} onConfirm={() => s.removeGroceryItem(item.id)} />
      {err && <p className="note gerr" role="alert">{err}</p>}
    </li>
  );
}

// While editing, the add form floats at the bottom of the screen with Done beside it, so adding an item or finishing never means
// scrolling the whole list. Name and Add are always there; store, count, price, note and Every month open under "More".
function EditDock({ g, onDone }: { g: GroceryT; onDone: () => void }) {
  const [f, setF] = useState(EMPTY_FORM); const [err, setErr] = useState<string | null>(null); const [more, setMore] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const m = useAppStore.getState().addGroceryItem(f);
    setErr(m); if (!m) setF({ ...EMPTY_FORM, store: f.store, every: f.every });
  };
  const { mine, suggested } = storeChoices(g);
  const dockRef = useRef<HTMLDivElement>(null);
  const w = unitWords(f.unit || undefined);
  useDockHeight(dockRef);
  return (
    <div className="gdock" ref={dockRef} role="region" aria-label="Add an item">
      <form onSubmit={submit} noValidate aria-label="Add an item">
        {more && (
          <div className="gdockmore" id="groc-dock-more">
            <input type="text" id="groc-store" className="gd-store" aria-label="Store" placeholder="Store (optional)" maxLength={40} list="groc-stores" value={f.store} onChange={e => setF({ ...f, store: e.target.value })} />
            <datalist id="groc-stores">{[...mine, ...suggested].map(x => <option key={x} value={x} />)}</datalist>
            <input type="text" id="groc-note" className="gd-note" aria-label="Note (optional)" placeholder="Note (optional)" maxLength={MAX_NOTE} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />
            <input type="text" id="groc-qty" className="gd-qty" inputMode="decimal" aria-label={w.count} placeholder={w.count} value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })} />
            <input type="text" id="groc-price" className="gd-price" inputMode="decimal" aria-label={`${w.price}, dollars (optional)`} placeholder={w.price} value={f.price} onChange={e => setF({ ...f, price: e.target.value })} />
            <select id="groc-unit" className="gd-unit" aria-label="Sold by" value={f.unit ?? ''} onChange={e => setF({ ...f, unit: e.target.value as GroceryUnit | '' })}>
              <option value="">Each</option>
              {UNITS.map(u => <option key={u} value={u}>by the {u}</option>)}
            </select>
            <label className="gcheck gd-every"><input type="checkbox" className="chk" id="groc-every" checked={f.every} onChange={e => setF({ ...f, every: e.target.checked })} /> Every month (else only when you’re out)</label>
          </div>
        )}
        {err && <p className="note gerr" role="alert">{err}</p>}
        <div className="gdockrow">
          <input type="text" id="groc-name" aria-label="Item name" placeholder="Add an item" maxLength={80} value={f.n} onChange={e => setF({ ...f, n: e.target.value })} />
          <button type="submit" className="btn sm" id="groc-add" disabled={!f.n.trim()}>Add</button>
          <button type="button" className="btn sm ghost" id="groc-more" aria-expanded={more} aria-controls="groc-dock-more" onClick={() => setMore(v => !v)}>{more ? 'Less' : 'More'}</button>
          <button type="button" className="btn sm gdone" id="groc-done" onClick={onDone}>Done</button>
        </div>
      </form>
    </div>
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
    <div className={editing ? 'gathome editing' : 'gathome'}>
      <div className="ghomehead">
        <p className="note">{editing ? 'Add, rename, move or remove what you buy.' : 'A tick means you have it. Untick an item when you run out and it goes on this month’s To get list. Every-month items are always on it.'}</p>
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
      {editing && <Stores g={g} />}
      {editing && <EditDock g={g} onDone={() => setEditing(false)} />}
    </div>
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
          <button type="button" id="groc-view-spend" className={view === 'spend' ? 'on' : ''} aria-pressed={view === 'spend'} onClick={() => setView('spend')}>Spending</button>
        </div>
      </div>
      {view === 'get' ? <ToGet g={g} months={months} nowKey={monthKey(today)} /> : view === 'home' ? <AtHome g={g} /> : <GrocerySpend nowKey={monthKey(today)} />}
    </section>
  );
}
