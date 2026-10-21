import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { MAX_NOTE, UNITS, byStore, centsText, emptyMonth, gotLast, groupTag, haveOf, inMonth, lineCost, lineOf, money, monthKey, monthLabel, onList, own, parseDollars, shiftMonth, storeChoices, tally, unitWords } from '../../lib/grocery.js';
import { allPeople, hasSharing, partiesFor, shareText } from '../../lib/grocerySettle.js';
import { removedBoughtByStore } from '../../lib/groceryRemoved.js';
import ArmedButton from '../ArmedButton.jsx';
import Icon from '../Icon.jsx';
import { motionOK } from '../../lib/motion.js';
import Notice, { UNDO_MS } from '../Notice.jsx';
import RemovedNotice from '../RemovedNotice.jsx';
import GrocerySpend from './GrocerySpend.js';
import PriceChips from './PriceChips.js';
import SharePicker from './SharePicker.js';
import SharingGroups from './SharingGroups.js';
import SplitSection from './SplitSection.js';
import StoreTax from './StoreTax.js';
import { MonthMoney, StoreMoney } from './StoreMoney.js';
import useDockHeight from './useDockHeight.js';
import type { Grocery as GroceryT, GroceryItem, GroceryMonth, GroceryUnit } from '../../types.ts';
import type { GroceryForm } from '../../store/types.ts';
import './Grocery.css';

// Three views (ADR 038, changed by ADR 054): To get is this month's shopping list; At home is every item you buy, ticked while you have it
// this month, which takes it off To get (a bought item counts as had); Spending charts what was bought. Every month starts with nothing ticked.
type View = 'get' | 'home' | 'spend';
const EMPTY_FORM: GroceryForm = { n: '', store: '', qty: '1', price: '', every: false, note: '', unit: '' };
const COUNT_ERROR = 'The count must be a number from 0.01 to 999.';
const PRICE_ERROR = 'The price must be dollars, like 3.49.';
const AHEAD = 12; // how many months past this one you can plan

// A count or price box that keeps what is typed and saves when you leave it (or press Enter), so a half-typed "3." is not rewritten under you.
function NumBox({ label, value, onCommit, className, error, disabled }: { label: string; value: string; onCommit: (text: string) => boolean; className: string; error?: string; disabled?: boolean }) {
  const [text, setText] = useState(value); const [seen, setSeen] = useState(value); const [bad, setBad] = useState(false);
  if (value !== seen) { setSeen(value); setText(value); setBad(false); } // the saved value changed from elsewhere
  const commit = () => { if (text === value) return setBad(false); setBad(!onCommit(text)); };
  return (
    <>
      <input type="text" inputMode="decimal" className={`gnum ${className}`} aria-label={label} aria-invalid={bad || undefined} disabled={disabled} value={text}
        onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />
      {bad && error && <span className="note gerr" role="alert">{error}</span>}
    </>
  );
}

// A set of ids (open rows, stores being adjusted) with one setter for any number of ids at once, and a way to empty it.
function useIdSet() {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const set = (list: string[], on: boolean) => setIds(prev => { const n = new Set(prev); list.forEach(id => (on ? n.add(id) : n.delete(id))); return n; });
  return [ids, set, () => setIds(new Set())] as const;
}
// The two typed boxes of a row, for To get (this month) and At home (the usual): each says whether the text was accepted, and saves through `save` when it was.
const commitQty = (t: string, save: (n: number) => void) => { const n = Number(t); if (!t.trim() || !Number.isFinite(n) || Math.round(n * 100) / 100 <= 0 || n > 999) return false; save(n); return true; }; // the count is kept to two decimals, so 0.001 would round to nothing
const commitPrice = (t: string, save: (cents: number | null) => void) => { if (!t.trim()) { save(null); return true; } const c = parseDollars(t); if (c == null) return false; save(c); return true; };

/* ---------- Expand all ---------- */
// One button on a store's heading: opens every row of that store, or closes them all once they are all open. Same words on To get and At home.
function ExpandAll({ label, all, onToggle }: { label: string; all: boolean; onToggle: (on: boolean) => void }) {
  return <button type="button" className="btn sm ghost gall" aria-label={`${all ? 'Collapse' : 'Expand'} all in ${label}`} onClick={() => onToggle(!all)}>{all ? 'Collapse all' : 'Expand all'}</button>;
}

/* ---------- To get ---------- */
// One line of the shopping list: the whole row ticks it, and the trailing "2 × $3.49" opens the count and price for this month.
function GetRow({ g, item, month, mk, future, carries, onGot, open, onOpen, onMove }: { g: GroceryT; item: GroceryItem; month: GroceryMonth; mk: string; future: boolean; carries: boolean; onGot: (on: boolean) => void; open: boolean; onOpen: (on: boolean) => void; onMove: (id: string) => void }) {
  const s = useAppStore.getState();
  const l = lineOf(item, month); const total = lineCost(l); const w = unitWords(item.unit);
  const moreId = `groc-more-${item.id}`;
  const usual = g.items.find(x => x.id === item.id)?.store ?? item.store; // `item` is already under the store it is bought at this month
  const [moveErr, setMoveErr] = useState<string | null>(null);
  const split = hasSharing(g); const raw = month.lines[item.id]; const people = allPeople(g);
  // Said on the closed row only when this item is split differently from its store's usual group, so most rows stay as quiet as without sharing.
  const customSplit = raw?.packShares?.some(Boolean) ? 'Packs split' : raw?.share || item.share ? shareText(partiesFor(g, item, raw)) : '';
  return (
    <li className={`gget${l.got ? ' got' : ''}`}>
      <div className="ggetline">
        {/* Only the checkbox ticks (a 44px target of its own): tapping the name opens the count, price and Move to panel, so a stray tap on the row cannot mark it bought. */}
        <label className="gtickbox">
          <input type="checkbox" className="chk" id={`groc-${item.id}`} aria-label={`Got ${item.n}`} checked={l.got} disabled={future} onChange={e => onGot(e.target.checked)} />
        </label>
        <button type="button" className="gtickname gnamebtn" aria-expanded={open} aria-controls={moreId} onClick={() => onOpen(!open)}>
          {item.n}
          {item.note && <small className="gnote">{item.note}</small>}
          {item.store !== usual && <small className="gnote gmoved">Usually {usual || 'Anywhere'}</small>}
        </button>
        {split && customSplit && <span className="gsplittag">{customSplit}</span>}
        <button type="button" className="gqty" aria-expanded={open} aria-controls={moreId} aria-label={`${w.count} and price of ${item.n}`} onClick={() => onOpen(!open)}>
          <span className={`gpill${l.cents == null && !l.prices ? ' noprice' : ''}`}>{l.prices ? `${l.prices.length} × avg ${money(Math.round(total / l.prices.length))}` : `${w.qty(l.qty)} × ${l.cents == null ? 'no price' : `${money(l.cents)}${w.per}`}`}</span>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} />
        </button>
      </div>
      {open && (
        <div className="gmore" id={moreId}>
          <label className="gfield">{w.count}
            <NumBox label={`${w.count} of ${item.n}`} className="gcount" value={String(l.qty)} error={COUNT_ERROR}
              onCommit={t => commitQty(t, n => s.setGroceryQty(mk, item.id, n))} />
          </label>
          <label className="gfield">{w.price}
            <NumBox label={`${w.price} of ${item.n}, dollars`} className="gprice" value={l.prices ? '' : centsText(l.cents)} error={PRICE_ERROR} disabled={!!l.prices && !item.unit}
              onCommit={t => commitPrice(t, c => s.setGroceryCents(mk, item.id, c))} />
          </label>
          {l.prices && !item.unit && <span className="note">Each pack has its own price, below. Remove them to set one price.</span>}
          {g.stores.length > 0 && (
            <label className="gfield">Move to
              <select id={`groc-store-${item.id}`} aria-label={`Store for ${item.n} this month`} value={item.store}
                onChange={e => { onMove(item.id); setMoveErr(s.setGroceryLineStore(mk, item.id, e.target.value)); }}>
                <option value="">Anywhere</option>
                {g.stores.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
          )}
          {item.store !== usual && (
            <button type="button" className="btn sm ghost gusual" aria-label={`Make ${item.store || 'Anywhere'} the usual store for ${item.n}`} onClick={() => setMoveErr(s.makeGroceryStoreUsual(mk, item.id))}>Make {item.store || 'Anywhere'} its usual store</button>
          )}
          {moveErr && <p className="note gerr" role="alert">{moveErr}</p>}
          {!item.unit && <PriceChips name={item.n} prices={l.prices} onChange={p => s.setGroceryPrices(mk, item.id, p)} />}
          {split && !l.prices && <SharePicker name={item.n} people={people} parties={partiesFor(g, item, raw)} own={!!raw?.share} hint={carries ? (future ? 'Saved as the usual from now on: it also changes this month’s items you have not bought yet.' : 'Saved as the usual for next month too.') : undefined} resetLabel={carries ? 'Back to the store’s split' : undefined} onChange={sh => s.setGroceryLineShare(mk, item.id, sh)} />}
          {split && l.prices?.map((c, i) => (
            <div key={i} className="gpackshare"><span>Pack {i + 1}, {money(c)}</span>
              <SharePicker name={`${item.n} pack ${i + 1}`} people={people} parties={partiesFor(g, item, raw, i)} own={!!raw?.packShares?.[i]} onChange={sh => s.setGroceryPackShare(mk, item.id, i, sh)} />
            </div>
          ))}
          <span className="gtotal" aria-label={`Total for ${item.n}`}>{l.cents == null && !l.prices ? '' : money(total)}</span>
          {!future && !l.got && <button type="button" className="btn sm ghost gtake" aria-label={`I have this: ${item.n}`} onClick={() => s.takeGroceryOff(mk, item.id)}>I have this</button>}
        </div>
      )}
    </li>
  );
}

function ToGet({ g, months, nowKey }: { g: GroceryT; months: Record<string, GroceryMonth>; nowKey: string }) {
  const split = hasSharing(g);
  const [off, setOff] = useState(0); // months from this one: below 0 is history, above 0 is planning ahead
  const mk = shiftMonth(nowKey, off);
  const month = months[mk] || emptyMonth();
  const list = inMonth(g, onList(g, month, off >= 0), month); const t = tally(list, month); // each item sits under the store it is bought at this month (Move to)
  // This month, what you have bought leaves the list (it is on At home as "have"); it stays one tap away under "Bought this month" so a
  // mis-tap can be undone. An older or later month keeps every row, as a record of what was bought or what is planned.
  const current = off === 0;
  const todo = current ? list.filter(i => !lineOf(i, month).got) : list;
  const bought = current ? list.filter(i => lineOf(i, month).got) : [];
  const todoStores = new Set(byStore(g, todo, split).map(x => x.store)); // a shared store with nothing left to get shows its money line in the bought fold instead
  // A store's tax box, once something is ticked there (or a tax is already typed): the receipt's tax for this month and what it comes to as a percent of the ticked items.
  // Items bought and then removed from the list still count in their store's tally and tax (audit X-8); a store left with none of its own items shows only its tax box.
  const removed = removedBoughtByStore(g, month);
  const taxRow = (store: string) => {
    if (!store) return null;
    const mine = list.filter(i => i.store === store); const cents = own(month.tax, store); const gone = removed[store];
    if (!cents && !gone && !mine.some(i => lineOf(i, month).got)) return null;
    return <StoreTax key={`${mk}:${store}`} mk={mk} store={store} cents={cents} subtotal={tally(mine, month).spent + (gone?.cents ?? 0) - (cents ?? 0)} />;
  };
  const listStores = new Set(list.map(i => i.store));
  const goneOnly = Object.keys(removed).filter(store => store && !listStores.has(store));
  // A ticked row moves to another part of the page, which would drop keyboard focus to the top. Put it on the next row to get (or the
  // one before), else on the "Bought this month" line; a row unticked from the fold lands back in the list, so focus follows it there.
  // The count and price panels' open state lives here, not in the row: a ticked row moves to the fold and is built again, and an open
  // panel must stay open so a price can still be typed after the tick (which also opens the fold).
  const [openIds, setPanels] = useIdSet(); // Expand all / Collapse all and one row, by id
  const [boughtOpen, setBoughtOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState<string | null>(null); // the month whose folded split section is open (one at a time, closed each time To get opens)
  // The money line over the list opens it, takes you there and puts focus on its header, so the next Tab is inside it; reduced motion jumps instead of gliding.
  const openSplit = () => { setSplitOpen(mk); window.setTimeout(() => { const at = document.getElementById(`groc-split-${mk}`); at?.scrollIntoView({ block: 'start', behavior: motionOK() ? 'smooth' : 'instant' }); at?.querySelector<HTMLElement>('.gsplittoggle')?.focus({ preventScroll: true }); }, 0); };
  const [armingSkip, setArmingSkip] = useState(false); // Skip all was pressed once
  const [ticked, setTicked] = useState<{ id: string; name: string; mk: string; t: number } | null>(null); // the item just ticked bought, for the Undo notice
  const setPanel = (id: string, on: boolean) => setPanels([id], on);
  useEffect(() => { if (!bought.length && boughtOpen) setBoughtOpen(false); }, [bought.length, boughtOpen]); // an emptied fold starts folded next time
  const focusAfter = useRef<string | null>(null);
  useEffect(() => { if (focusAfter.current) { document.getElementById(focusAfter.current)?.focus(); focusAfter.current = null; } });
  const tick = (id: string, on: boolean) => {
    if (!useAppStore.getState().setGroceryGot(mk, id, on)) return; // nothing changed (data still loading): no Undo notice and no focus jump for it
    if (current) {
      const order = byStore(g, todo, split).flatMap(grp => gotLast(grp.items, month)).map(i => i.id);
      const at = order.indexOf(id); const next = order[at + 1] ?? order[at - 1];
      const typing = on && openIds.has(id); // its panel is open: stay with the row in the fold, to finish the price
      if (typing) setBoughtOpen(true);
      focusAfter.current = !on || typing ? `groc-${id}` : next ? `groc-${next}` : 'groc-bought-sum';
    }
    setTicked(on && current ? { id, name: g.items.find(x => x.id === id)?.n ?? '', mk, t: Date.now() } : null); // a tick can be taken back from the notice; any other change replaces or clears it
  };
  return (
    <>
      <div className="gmonth" role="group" aria-label="Month">
        <button type="button" className="btn sm" id="groc-prev" aria-label="Previous month" onClick={() => setOff(o => o - 1)}><Icon name="chevron-left" /></button>
        <b id="groc-month" role="status" aria-live="polite">{monthLabel(mk)}{off === 0 ? ' (this month)' : off > 0 ? ' (ahead)' : ''}</b>
        <button type="button" className="btn sm" id="groc-next" aria-label="Next month" disabled={off >= AHEAD} onClick={() => setOff(o => Math.min(AHEAD, o + 1))}><Icon name="chevron-right" /></button>
      </div>
      {t.count > 0 && <div className="gprog" aria-hidden="true"><span style={{ width: `${Math.round((t.got / t.count) * 100)}%` }} /></div>}
      <p className="note" id="groc-summary" role="status">
        {t.count ? <>{`Got ${t.got} of ${t.count} · Spent ${money(t.spent)}${t.taxed ? ' with tax' : ''} · Expected ${money(t.planned)}`}{t.unpriced > 0 && <>{' · '}<span className="gwarn">{t.unpriced} without a price</span></>}</> : off > 0 ? 'Nothing planned yet. Items you add on At home show up here.' : 'Nothing on this month’s list.'}
      </p>
      {split && <MonthMoney g={g} month={month} onOpen={openSplit} open={splitOpen === mk} />}
      {!t.count && off === 0 && <p className="note">Add what you buy on <b>At home</b>. Tick an item there when you have it and it comes off this month’s list.</p>}
      {current && todo.length > 0 && (
        <div className="gskiprow">
          <ArmedButton className={`btn sm ${armingSkip ? 'danger' : 'ghost'}`} id="groc-skipall" aria-label={`Skip all ${todo.length} items still to get this month`} label="Skip all" armedLabel={`Tap again to skip ${todo.length}`}
            onArmedChange={setArmingSkip} onConfirm={() => { setArmingSkip(false); useAppStore.getState().takeGroceryAllOff(mk); }} />
        </div>
      )}
      <RemovedNotice scope="groceryoff" />
      {current && t.count > 0 && !todo.length && <p className="note" id="groc-alldone">Everything on this month’s list is bought.</p>}
      {byStore(g, todo, split).map((grp, gi) => {
        const gt = tally(grp.items, month); const gone = removed[grp.store]; // the tally counts a purchase of a removed item too
        if (gone) { gt.got += gone.count; gt.count += gone.count; gt.planned += gone.cents; }
        return (
          <section key={grp.store || '_'} className={`gstore${!current && gt.got === gt.count ? ' done' : ''}`} aria-labelledby={`groc-h-${gi}`}>
            <div className="gstorehead">
              <h3 id={`groc-h-${gi}`}>{grp.label}{split && grp.group && <span className="gtag"> {groupTag(grp.group)}</span>}</h3>
              <span className="gstoremeta">
                <span className="note">{current ? `${gt.count} to get` : `${gt.got}/${gt.count}`}{gt.planned ? ` · ${money(gt.planned)}` : ''}</span>
                <ExpandAll label={grp.label} all={grp.items.every(i => openIds.has(i.id))} onToggle={on => setPanels(grp.items.map(i => i.id), on)} />
              </span>
            </div>
            {split && grp.group && <StoreMoney g={g} month={month} store={grp.store} />}
            {taxRow(grp.store)}
            <ul className="glist">{gotLast(grp.items, month).map(it => <GetRow key={it.id} g={g} item={it} month={month} mk={mk} future={off > 0} carries={off >= 0} onGot={on => tick(it.id, on)} open={openIds.has(it.id)} onOpen={on => setPanel(it.id, on)} onMove={id => { focusAfter.current = `groc-store-${id}`; }} />)}</ul>
          </section>
        );
      })}
      {goneOnly.map(store => (
        <section key={`gone:${store}`} className="gstore" aria-label={`Bought from ${store}`}>
          <div className="gstorehead"><h3>{store}</h3></div>
          <p className="note">Bought here, then removed from your list.</p>
          {taxRow(store)}
        </section>
      ))}
      {bought.length > 0 && (
        <details className="gbought" id="groc-bought" open={boughtOpen} onToggle={e => setBoughtOpen(e.currentTarget.open)}>
          <summary id="groc-bought-sum">Bought this month ({bought.length})</summary>
          <p className="note">You have these at home, so they are ticked <b>Have</b> on At home. Untick one to put it back on the list.</p>
          {byStore(g, bought, split).map(grp => (
            <section key={grp.store || '_'} className="gstore" aria-label={`Bought from ${grp.label}`}>
              <div className="gstorehead"><h3>{grp.label}{split && grp.group && <span className="gtag"> {groupTag(grp.group)}</span>}</h3></div>
              {split && grp.group && !todoStores.has(grp.store) && <StoreMoney g={g} month={month} store={grp.store} />}
              {!todoStores.has(grp.store) && taxRow(grp.store)}
              <ul className="glist">{grp.items.map(it => <GetRow key={it.id} g={g} item={it} month={month} mk={mk} future={false} carries={off >= 0} onGot={on => tick(it.id, on)} open={openIds.has(it.id)} onOpen={on => setPanel(it.id, on)} onMove={id => { focusAfter.current = `groc-store-${id}`; }} />)}</ul>
            </section>
          ))}
        </details>
      )}
      {split && <SplitSection g={g} month={month} mk={mk} open={splitOpen === mk} onToggle={on => setSplitOpen(on ? mk : null)} />}
      {ticked && ticked.mk === mk && (
        <div className="gtickednote">
          <Notice kind="undo" expire={{ ms: UNDO_MS, onExpire: () => setTicked(null), key: ticked.t }}
            actions={[{ label: 'Undo', onClick: () => tick(ticked.id, false) }, { label: 'Dismiss', ghost: true, onClick: () => setTicked(null) }]}>
            <b>Bought</b> {ticked.name}.
          </Notice>
        </div>
      )}
    </>
  );
}

/* ---------- At home ---------- */
// "Have" is one tick shared with To get: a When-out item has it unless it is out (ticking it bought on To get clears "out"), and an
// Every-month item has it once it is ticked bought this month. So a tick on either list shows on the other.
function HomeRow({ item, have, bought, onHave }: { item: GroceryItem; have: boolean; bought: boolean; onHave: (on: boolean) => void }) {
  return (
    <li className="ghome">
      <label className="gtick">
        <input type="checkbox" className="chk" id={`groc-have-${item.id}`} aria-label={`Have ${item.n}`} checked={have} onChange={e => onHave(e.target.checked)} />
        <span className="gtickname">{item.n}{item.note && <small className="gnote">{item.note}</small>}</span>
      </label>
      {bought && <span className="gchip">Bought</span>}
    </li>
  );
}

function EditRow({ item, g, have, onHave, adjust, open, onOpen }: { item: GroceryItem; g: GroceryT; have: boolean; onHave: (on: boolean) => void; adjust: boolean; open: boolean; onOpen: (on: boolean) => void }) {
  const s = useAppStore.getState();
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(item.n);
  const [arming, setArming] = useState(false); // Remove was pressed once
  const { mine, suggested } = storeChoices(g);
  const split = hasSharing(g);
  const w = unitWords(item.unit);
  const usualPrice = item.unit ? `Usual price per ${item.unit}` : 'Usual price each'; // this box sets the item's usual price; To get's Price each is this month's
  const arrow = <button type="button" className="garrow" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${item.n}`} onClick={() => onOpen(!open)}><Icon name={open ? 'chevron-up' : 'chevron-down'} /></button>;
  const tick = <input type="checkbox" className="chk gedithave" aria-label={`Have ${item.n}`} checked={have} onChange={e => onHave(e.target.checked)} />;
  // Closed: one line, tick and name and what is unusual about it (a unit, its own split); the name and the arrow open it.
  if (!open) {
    return (
      <li className="gedit gedshut">
        {tick}
        <button type="button" className="gedname" aria-expanded={false} onClick={() => onOpen(true)}>
          {item.n}{item.note && <small className="gnote">{item.note}</small>}
        </button>
        {item.unit && <span className="gchip">by the {item.unit}</span>}
        {split && item.share && <span className="gsplittag">{shareText(partiesFor(g, item))}</span>}
        {arrow}
      </li>
    );
  }
  return (
    <li className={`gedit${arming ? ' removing' : ''}`}>
      {tick}
      <input type="text" className="gname" aria-label={`Name of ${item.n}`} maxLength={80} value={name} onChange={e => setName(e.target.value)}
        onBlur={() => { if (name.trim() && name.trim() !== item.n) setErr(s.updateGroceryItem(item.id, { n: name })); else setName(item.n); }} />
      {arrow}
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
      <div className="gedrow">
        <label className="gfield">{w.count}
          <NumBox label={`${w.count} of ${item.n}`} className="gcount" value={String(item.qty)} error={COUNT_ERROR}
            onCommit={t => commitQty(t, n => setErr(s.updateGroceryItem(item.id, { qty: n })))} />
        </label>
        <label className="gfield">{usualPrice}
          <NumBox label={`${usualPrice} of ${item.n}, dollars`} className="gprice" value={centsText(item.cents)} error={PRICE_ERROR}
            onCommit={t => commitPrice(t, c => setErr(s.updateGroceryItem(item.id, { cents: c })))} />
        </label>
      </div>
      {split && (adjust || !!item.share) && <SharePicker name={item.n} people={allPeople(g)} parties={partiesFor(g, item)} own={!!item.share} onChange={sh => s.setGroceryItemShare(item.id, sh)} />}
      <ArmedButton className={`btn sm ${arming ? 'danger' : 'ghost'}`} aria-label={`Remove ${item.n} from your list`} label="Remove" armedLabel="Tap again to remove" onArmedChange={setArming} onConfirm={() => { onOpen(false); s.removeGroceryItem(item.id); }} />
      {err && <p className="note gerr" role="alert">{err}</p>}
    </li>
  );
}

// While editing, the add form floats at the bottom of the screen with Done beside it, so adding an item or finishing never means
// scrolling the whole list. Name and Add are always there; store, count, price, unit and note open under "More".
function EditDock({ g, onDone }: { g: GroceryT; onDone: () => void }) {
  const [f, setF] = useState(EMPTY_FORM); const [err, setErr] = useState<string | null>(null); const [more, setMore] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const m = useAppStore.getState().addGroceryItem(f);
    setErr(m); if (!m) { setF({ ...EMPTY_FORM, store: f.store }); document.getElementById('groc-name')?.focus(); } // the Add button goes off once the name is empty: keep focus in the name box for the next item
  };
  const finish = () => { if (f.n.trim()) { setErr('Add or clear this item first.'); document.getElementById('groc-name')?.focus(); return; } onDone(); }; // typed text is kept, not dropped by Done
  const { mine, suggested } = storeChoices(g);
  const dockRef = useRef<HTMLDivElement>(null);
  const w = unitWords(f.unit || undefined);
  useDockHeight(dockRef);
  return (
    <div className="gdock" ref={dockRef} role="region" aria-label="Add an item">
      <form onSubmit={submit} noValidate aria-label="Add an item">
        <span className="gdocklab" aria-hidden="true">New item</span>
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
          </div>
        )}
        {err && <p className="note gerr" role="alert">{err}</p>}
        <div className="gdockrow">
          <input type="text" id="groc-name" aria-label="Item name" placeholder="Add an item" maxLength={80} value={f.n} onChange={e => setF({ ...f, n: e.target.value })} />
          <button type="submit" className="btn sm gdockadd" id="groc-add" disabled={!f.n.trim()}>Add</button>
          <button type="button" className="btn sm ghost gdockmorebtn" id="groc-more" aria-expanded={more} aria-controls="groc-dock-more" onClick={() => setMore(v => !v)}>{more ? 'Less' : 'More'}</button>
          <button type="button" className="btn sm gdone" id="groc-done" onClick={finish}>Done</button>
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

function AtHome({ g, months, nowKey }: { g: GroceryT; months: Record<string, GroceryMonth>; nowKey: string }) {
  const [editing, setEditing] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false); // the Sharing panel (groups and who is in them) above the list, reachable without Edit
  const [openEdit, setEdits, clearEdits] = useIdSet(); // items whose edit form is open; every item starts closed each time Edit is pressed
  const setEditMode = (on: boolean) => { setEditing(on); clearEdits(); };
  const [adjusting, setAdjust] = useIdSet(); // stores whose rows show their share controls while editing (the rest show them only when an item has its own split)
  const toggleAdjust = (store: string) => setAdjust([store], !adjusting.has(store));
  const month = months[nowKey] || emptyMonth();
  const hasIt = (it: GroceryItem) => haveOf(it, month);
  const setHave = (it: GroceryItem, on: boolean) => useAppStore.getState().setGroceryHave(nowKey, it.id, on);
  return (
    <div className={editing ? 'gathome editing' : 'gathome'}>
      <div className="ghomehead gsharehead">
        {editing && <b className="geditbadge">Editing</b>}
        <p className="note">{editing ? 'Add, rename, move or remove what you buy.' : 'A tick means you have it this month, so it is off To get. Ticks clear on the 1st and everything is back on the list.'}</p>
        <div className="ghomebtns">
          <button type="button" className="btn sm ghost" id="groc-sharing" aria-pressed={sharingOpen} onClick={() => setSharingOpen(v => !v)}>{sharingOpen ? 'Close sharing' : 'Sharing'}</button>
          <button type="button" className="btn sm ghost" id="groc-edit" aria-pressed={editing} onClick={() => setEditMode(!editing)}>{editing ? 'Done' : 'Edit'}</button>
        </div>
      </div>
      {!hasSharing(g) && !sharingOpen && g.items.length > 0 && (
        <p className="note gshareprompt">Buy groceries with other people? <button type="button" className="btn sm ghost" id="groc-sharing-prompt" onClick={() => setSharingOpen(true)}>Set up sharing</button></p>
      )}
      {sharingOpen && <SharingGroups g={g} />}
      <RemovedNotice scope="grocery" />
      {!g.items.length && !editing && <p className="note">Your list is empty. Use Edit to add what you buy and where.</p>}
      {byStore(g, g.items, true).map((grp, gi) => (
        <section key={grp.store || '_'} className="gstore" aria-labelledby={`groc-home-h-${gi}`}>
          <div className="gstorehead">
            <h3 id={`groc-home-h-${gi}`}>{grp.label}{grp.group && <span className="gtag"> {groupTag(grp.group)}</span>}</h3>
            {editing && <ExpandAll label={grp.label} all={grp.items.every(i => openEdit.has(i.id))} onToggle={on => setEdits(grp.items.map(i => i.id), on)} />}
          </div>
          {editing && hasSharing(g) && (
            <button type="button" className="btn sm ghost gadjust" aria-pressed={adjusting.has(grp.store)} onClick={() => { if (!adjusting.has(grp.store)) setEdits(grp.items.map(i => i.id), true); toggleAdjust(grp.store); }}>
              {adjusting.has(grp.store) ? `Done adjusting ${grp.label}` : `Adjust shares for ${grp.label}`}
            </button>
          )}
          <ul className="glist">{grp.items.map(it => (editing ? <EditRow key={it.id} item={it} g={g} adjust={adjusting.has(grp.store)} have={hasIt(it)} onHave={on => setHave(it, on)} open={openEdit.has(it.id)} onOpen={on => setEdits([it.id], on)} /> : <HomeRow key={it.id} item={it} have={hasIt(it)} bought={lineOf(it, month).got} onHave={on => setHave(it, on)} />))}</ul>
        </section>
      ))}
      {editing && <Stores g={g} />}
      {editing && <EditDock g={g} onDone={() => setEditMode(false)} />}
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
      {view === 'get' ? <ToGet g={g} months={months} nowKey={monthKey(today)} /> : view === 'home' ? <AtHome g={g} months={months} nowKey={monthKey(today)} /> : <GrocerySpend nowKey={monthKey(today)} />}
    </section>
  );
}
