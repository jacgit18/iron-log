import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useFeature } from '../../features.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { MAX_NOTE, UNITS, byStore, carriedCount, centsText, emptyMonth, gotLast, groupTag, haveOf, inMonth, lineCost, lineOf, lineTotal, money, monthKey, monthLabel, onList, own, parseDollars, removedBought, shiftMonth, storeChoices, tally, unitWords } from '../../lib/grocery.js';
import { itemHistory, lastBoughtText } from '../../lib/itemHistory.js';
import { DEFAULT_GROCERY_SORT, GET_SORTS, HOME_SORTS, filterGroceryItems, sortGroceryItems } from '../../lib/grocerySort.js';
import { columnsClass } from '../../lib/groceryColumns.js';
import { allPeople, hasSharing, partiesFor, shareText } from '../../lib/grocerySettle.js';
import { removedBoughtByStore } from '../../lib/groceryRemoved.js';
import { allIds, allPicked, boughtRows, storeIds, viewCounts } from '../../lib/groceryBought.js';
import { ALL_CHIP, DETAILS_CHOICES, chipGroups, chipsOf, detailsStartOpen, haveCount, hasNoPrice, itemsText, resolveChip, showChips } from '../../lib/groceryChips.js';
import { quickAddNotice } from '../../lib/groceryQuickAdd.js';
import { dailyFix, pageOf } from '../../lib/route.js';
import EmptyTiles from '../EmptyTiles.js';
import { navigate, useRoutePath } from '../useRoute.js';
import ArmedButton from '../ArmedButton.jsx';
import BulkShare, { SelectButton } from './BulkShare.js';
import GroceryBar, { NoMatch } from './GroceryBar.js';
import GroceryBoughtTabs, { type BoughtView } from './GroceryBoughtTabs.js';
import GroceryMore from './GroceryMore.js';
import GroceryPhoneBar from './GroceryPhoneBar.js';
import GroceryQuickAdd from './GroceryQuickAdd.js';
import GroceryRail from './GroceryRail.js';
import InventoryRail from './InventoryRail.js';
import GroceryStoreChips from './GroceryStoreChips.js';
import GroceryTotalBar from './GroceryTotalBar.js';
import useMinWidth from './useMinWidth.js';
import GrocerySummary from './GrocerySummary.js';
import Icon from '../Icon.jsx';
import { motionOK } from '../../lib/motion.js';
import Notice, { UNDO_MS } from '../Notice.jsx';
import RemovedNotice from '../RemovedNotice.jsx';
import GrocerySpend from './GrocerySpend.js';
import PriceChips from './PriceChips.js';
import ReceiptNames from './ReceiptNames.js';
import ReceiptScan, { ReceiptMenu, useReceiptScan } from './ReceiptScan.js';
import Receipts from './Receipts.js';
import SharePicker from './SharePicker.js';
import SharingGroups from './SharingGroups.js';
import SplitSection from './SplitSection.js';
import StoreTax from './StoreTax.js';
import { StoreMoney } from './StoreMoney.js';
import useDockHeight from './useDockHeight.js';
import { useSortChoice } from '../useSortChoice.js';
import type { Grocery as GroceryT, GroceryItem, GroceryMonth, GroceryUnit } from '../../types.ts';
import type { GroceryForm } from '../../store/types.ts';
import './Grocery.css';
import './GroceryLayout.css';
import './PriceHistory.css';

// Three views (ADR 038, changed by ADR 054 and 079): Shopping is this month's list; Bought is what you ticked this month, with Spending history (what you spent by month and store) as its second switch;
// Inventory is every item you buy, ticked while you have it (a new month keeps last month's ticks). A bought item counts as had. A new month starts with last month’s ticks (ADR 079).
type View = 'shopping' | 'bought' | 'inventory';
const VIEWS: readonly string[] = ['shopping', 'bought', 'inventory'];
const SUBTITLE: Record<View | 'history', string> = { shopping: 'What is left to buy this month, by store.', bought: 'Bought this month. These count as in your inventory. Tap a box to put one back on Shopping.', inventory: 'Your usual items. Tick what you already have.', history: 'What you spent by month and store.' };
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
  return <button type="button" className="btn sm ghost gall" aria-label={`${all ? 'Hide' : 'Show'} details in ${label}`} onClick={() => onToggle(!all)}>{all ? 'Hide details' : 'Show details'}</button>;
}

/* ---------- To get ---------- */
// One line of the shopping list: the whole row ticks it, and the trailing "2 × $3.49" opens the count and price for this month.
function GetRow({ g, item, month, mk, future, carries, onGot, open, onOpen, onMove, pick }: { g: GroceryT; item: GroceryItem; month: GroceryMonth; mk: string; future: boolean; carries: boolean; onGot: (on: boolean) => void; open: boolean; onOpen: (on: boolean) => void; onMove: (id: string) => void; pick?: { on: boolean; set: (on: boolean) => void } }) {
  const s = useAppStore.getState();
  const l = lineOf(item, month); const total = lineCost(l); const w = unitWords(item.unit);
  const moreId = `groc-more-${item.id}`;
  const usual = g.items.find(x => x.id === item.id)?.store ?? item.store; // `item` is already under the store it is bought at this month
  const [moveErr, setMoveErr] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) { setWasOpen(open); if (!open) setMoveErr(null); } // a Move to message does not wait for the next time the row opens
  const split = hasSharing(g); const raw = month.lines[item.id]; const people = allPeople(g);
  const pill = l.prices ? `${l.prices.length} × avg ${money(Math.round(total / l.prices.length))}` : l.got && hasNoPrice(l) ? 'Add price' : `${w.qty(l.qty)} × ${l.cents == null ? 'no price' : `${money(l.cents)}${w.per}`}`; // the visible words of the count and price button; its accessible name starts with them
  // Said on every row that is not plain "Just me": the store's group split shows by default, not only after the row is changed (ADR 059 amended 2026-10-23).
  const parties = partiesFor(g, item, raw); // always computed: with no groups it reads Just me, never Not mine
  const customSplit = raw?.packShares?.some(Boolean) ? 'Packs split' : raw?.share || item.share || (split && shareText(parties) !== 'Just me') ? shareText(parties) : '';
  return (
    <li className={`gget${l.got ? ' got' : ''}${pick?.on ? ' picked' : ''}`}>
      <div className="ggetline">
        {pick && <label className="gtickbox"><input type="checkbox" className="chk" aria-label={`Select ${item.n}`} checked={pick.on} onChange={e => pick.set(e.target.checked)} /></label>}
        {/* Only the checkbox ticks (a 44px target of its own): tapping the name opens the count, price and Move to panel, so a stray tap on the row cannot mark it bought. */}
        {!pick && <label className="gtickbox">
          <input type="checkbox" className="chk" id={`groc-${item.id}`} aria-label={`Got ${item.n}`} checked={l.got} disabled={future} onChange={e => onGot(e.target.checked)} />
        </label>}
        <button type="button" className="gtickname gnamebtn" aria-expanded={open} aria-controls={moreId} onClick={() => onOpen(!open)}>
          {item.n}
          {item.note && <small className="gnote">{item.note}</small>}
          {item.store !== usual && <small className="gnote gmoved">Usually {usual || 'Anywhere'}</small>}
          {split && customSplit && <span className="gsplittag gsplitunder">{customSplit}</span>}
        </button>
        <button type="button" className="gqty" aria-expanded={open} aria-controls={moreId} aria-label={`${pill}, ${w.count.toLowerCase()} and price of ${item.n}`} onClick={() => onOpen(!open)}>
          <span className={`gpill${l.cents == null && !l.prices ? ' noprice' : ''}`}>{pill}</span>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} />
        </button>
      </div>
      <div className="gmore" id={moreId} hidden={!open}>{open && (<>
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
                {item.store && !g.stores.includes(item.store) && <option value={item.store}>{item.store} (removed)</option>}
              </select>
            </label>
          )}
          {item.store !== usual && (
            <button type="button" className="btn sm ghost gusual" aria-label={`Make ${item.store || 'Anywhere'} its usual store for ${item.n}`} onClick={() => setMoveErr(s.makeGroceryStoreUsual(mk, item.id))}>Make {item.store || 'Anywhere'} its usual store</button>
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
      </>)}</div>
    </li>
  );
}

function ToGet({ g, months, nowKey, mode, off0, onOff, priceFor, onAddPrice }: { g: GroceryT; months: Record<string, GroceryMonth>; nowKey: string; mode: 'shopping' | 'bought'; off0: number; onOff: (off: number) => void; priceFor: string | null; onAddPrice: (id: string | null) => void }) {
  const split = hasSharing(g);
  const onBought = mode === 'bought';
  const [off, setOffNow] = useState(off0); // months from this one: below 0 is history, above 0 is planning ahead
  const mk = shiftMonth(nowKey, off);
  const month = months[mk] || emptyMonth();
  const list = inMonth(g, onList(g, month, off >= 0), month); // each item sits under the store it is bought at this month (Move to)
  const everBought = [...list, ...removedBought(g, month)]; // the count, the Spent tile and the tax hint also see the bought lines of items removed since, as the store lines and Spending do
  const t = tally(everBought, month);
  // This month, what you have bought leaves the list (it is on At home as "have"); it stays one tap away under "Bought this month" so a
  // mis-tap can be undone. An older or later month keeps every row, as a record of what was bought or what is planned.
  const current = off === 0;
  const todo = current ? list.filter(i => !lineOf(i, month).got) : list;
  const bought = boughtRows(list, month); // the Bought view, for any month; Shopping no longer shows them
  const carried = useMemo(() => (current ? carriedCount(g, months, mk) : 0), [current, g, months, mk]); // ticks the month started with that are still ticked (ADR 079)
  // Search and Sort change only what is shown: the stored list, the tallies and Skip all still see the whole month.
  const [q, setQ] = useState('');
  const [sort, setSort] = useSortChoice('grocery-get', GET_SORTS, DEFAULT_GROCERY_SORT);
  const facts = { cents: (i: GroceryItem) => { const l = lineOf(i, month); return l.cents == null && !l.prices ? null : lineCost(l); }, ticked: (i: GroceryItem) => lineOf(i, month).got };
  const shape = (items: GroceryItem[]) => byStore(g, filterGroceryItems(items, q), split).map(grp => ({ ...grp, items: sortGroceryItems(grp.items, sort, facts) }));
  const shownTodo = shape(todo); const shownBought = shape(bought);
  // Store chips (Shopping and Bought): All, and one per store with rows to get (Shopping) or bought rows (Bought). Their counts ignore the search; a chip whose store has nothing left falls back to All.
  const chipSource = byStore(g, onBought ? bought : todo, split);
  const chips = chipsOf(chipSource);
  const [chipPick, setChipPick] = useState(ALL_CHIP);
  const chip = resolveChip(chipPick, chipSource);
  const shown = chipGroups(onBought ? shownBought : shownTodo, chip);
  const withChips = showChips(chips);
  const noMatch = !!q.trim() && !shown.length;
  // A store's tax box, once something is ticked there (or a tax is already typed): the receipt's tax for this month and what it comes to as a percent of the ticked items.
  // Items bought and then removed from the list still count in their store's tally and tax (audit X-8); a store left with none of its own items shows only its tax box.
  const removed = removedBoughtByStore(g, month);
  const taxRow = (store: string) => {
    if (!store) return null;
    const mine = everBought.filter(i => i.store === store); const cents = own(month.tax, store);
    if (!cents && !mine.some(i => lineOf(i, month).got)) return null;
    return <StoreTax key={`${mk}:${store}`} mk={mk} store={store} cents={cents} subtotal={tally(mine, month).spent - (cents ?? 0)} />;
  };
  const listStores = new Set(list.map(i => i.store));
  const goneOnly = onBought && chip === ALL_CHIP ? Object.keys(removed).filter(store => store && !listStores.has(store)) : [];
  // A ticked row leaves this view for the other one (Shopping to Bought and back), which would drop keyboard focus to the top. Put it on the next row here (or the
  // one before), else on the other view's tab; an Undo of a tick on Shopping lands the row back in the list, so focus follows it there.
  // The count and price panels' open state lives here, not in the row. `ToGet` is keyed by the view, so switching views remounts it and every panel starts shut:
  // a row ticked with its panel open is on Bought with the panel closed, and its price is finished there.
  // Row details (count, price, Move to, Shared with) start open above 700 px and closed on a phone; a choice in the More menu wins and is remembered on this device.
  // `toggled` holds the rows the person flipped from that default, so Show details and Hide details work on top of either start.
  const wide = useMinWidth(701);
  const rail = useMinWidth(1100);
  const [detailsChoice, setDetailsChoice] = useSortChoice('grocery-details', DETAILS_CHOICES, 'auto');
  const defaultOpen = detailsStartOpen(detailsChoice, wide ? 701 : 0);
  const [toggled, setToggled, clearToggled] = useIdSet();
  const isOpen = (id: string) => defaultOpen !== toggled.has(id);
  const setOpen = (ids: string[], on: boolean) => setToggled(ids, on !== defaultOpen);
  useEffect(() => { // once, on arriving from the tick notice's Add price: open the row, bring it into view and put focus on its price box
    if (!priceFor) return;
    setOpen([priceFor], true); onAddPrice(null);
    window.setTimeout(() => { const box = document.querySelector<HTMLInputElement>(`#groc-more-${priceFor} .gprice`); box?.scrollIntoView({ block: 'center', behavior: motionOK() ? 'smooth' : 'instant' }); box?.focus({ preventScroll: true }); }, 0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [splitOpen, setSplitOpen] = useState<string | null>(null); // the month whose folded split section is open (one at a time, closed each time Shopping or Bought opens)
  // Expand all and Collapse all on a store cover its rows to get and the ones already bought this month (a row ticked while open stays open in the fold).
  const storeRows = (grp: { store: string; items: GroceryItem[] }) => grp.items;
  const rs = useReceiptScan(g, mk);
  const [armingSkip, setArmingSkip] = useState(false); // Skip all was pressed once
  const [quick, setQuick] = useState<{ id: string; name: string; label: string; every: boolean; t: number } | null>(null); // the item just quick-added, for its notice (Make it every month, Undo)
  const [selecting, setSelecting] = useState(false); // Select mode (brief grocery-bulk-share): the rows to get carry a checkbox; nothing is written until Share… is applied
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const pickedIds = allIds(shown).filter(id => picked.has(id)); // only what is on screen: a search that hides a row leaves it out
  const pickSome = (ids: string[], on: boolean) => setPicked(p => { const n = new Set(p); ids.forEach(id => (on ? n.add(id) : n.delete(id))); return n; });
  const setSelect = (on: boolean) => { setSelecting(on); setPicked(new Set()); };
  const [ticked, setTicked] = useState<{ id: string; name: string; mk: string; t: number; unpriced: boolean } | null>(null); // the item just ticked bought, for the Undo notice; `unpriced`: it has no price yet, so the notice offers Add price
  const setPanel = (id: string, on: boolean) => setOpen([id], on);
  const setOff = (f: (o: number) => number) => { const next = f(off); setOffNow(next); onOff(next); clearToggled(); setSplitOpen(null); setQ(''); setSelect(false); setQuick(null); }; // another month starts with every row and the split card folded
  const focusAfter = useRef<string | null>(null);
  useEffect(() => { if (focusAfter.current) { document.getElementById(focusAfter.current)?.focus(); focusAfter.current = null; } });
  const tick = (id: string, on: boolean) => {
    if (!useAppStore.getState().setGroceryGot(mk, id, on)) return; // nothing changed (data still loading): no Undo notice and no focus jump for it
    if (current) {
      const order = onBought ? allIds(shown) : shownTodo.flatMap(grp => gotLast(grp.items, month)).map(i => i.id);
      const at = order.indexOf(id); const next = order[at + 1] ?? order[at - 1];
      focusAfter.current = !on && !onBought ? `groc-${id}` : next ? `groc-${next}` : onBought ? 'groc-view-shopping' : 'groc-view-bought'; // a row that moves to the other view: focus the next row here, else the other view's tab
    }
    const ticked1 = g.items.find(x => x.id === id); // the item once: its name and whether it has a price come from the same row, and none found says nothing about a price
    setTicked(on && current ? { id, name: ticked1?.n ?? '', mk, t: Date.now(), unpriced: ticked1 ? hasNoPrice(lineOf(ticked1, month)) : false } : null); // a tick can be taken back from the notice; any other change replaces or clears it
  };
  const emptyText = off > 0 ? 'Nothing planned yet. Items you add on Inventory show up here.' : 'Nothing on this month’s list.';
  const pickAll = allIds(shown); const allOn = allPicked(pickAll, picked);
  const summary = rail
    ? null // from 1100 px the rail's card is the summary
    : wide ? <GrocerySummary t={t} view={mode} empty={emptyText} /> : null; // a phone has the total bar in the stack below
  const phoneShop = !wide && !onBought; // Shopping on a phone: full-width Scan receipt, full-width search, then Sort, Select items and More in one row
  const selectBtn = <SelectButton g={g} canSelect={shown.length > 0} selecting={selecting} onSelecting={setSelect} />;
  const detailsBtns = (
    <>
      <button type="button" className="btn sm ghost" id="groc-details-all" onClick={() => { clearToggled(); setDetailsChoice(defaultOpen ? 'closed' : 'open'); }}>{defaultOpen ? 'Hide details on all rows' : 'Show details on all rows'}</button>
      {detailsChoice !== 'auto' && <button type="button" className="btn sm ghost" id="groc-details-auto" onClick={() => { clearToggled(); setDetailsChoice('auto'); }}>Details by screen size</button>}
    </>
  );
  const skipBtn = !onBought && current && todo.length > 0 && !q.trim() && ( // not while a search hides rows: it would skip items you cannot see
    <ArmedButton className={`btn sm ${armingSkip ? 'danger' : 'ghost'}`} id="groc-skipall" aria-label={`Skip the ${todo.length} left: every item still to get this month`} label={`Skip the ${todo.length} left`} armedLabel={`Tap again to skip ${todo.length}`}
      onArmedChange={setArmingSkip} onConfirm={() => { setArmingSkip(false); useAppStore.getState().takeGroceryAllOff(mk); }} />
  );
  const main = (
    <div className="gmain">
      {onBought && split && <SplitSection g={g} month={month} mk={mk} open={splitOpen === mk} onToggle={on => setSplitOpen(on ? mk : null)} />}
      <div className="gmonth" role="group" aria-label="Month">
        <button type="button" className="btn sm" id="groc-prev" aria-label="Previous month" onClick={() => setOff(o => o - 1)}><Icon name="chevron-left" /></button>
        <b id="groc-month" role="status" aria-live="polite">{monthLabel(mk)}{off === 0 ? ' (this month)' : off > 0 ? ' (ahead)' : ''}</b>
        <button type="button" className="btn sm" id="groc-next" aria-label="Next month" disabled={off >= AHEAD} onClick={() => setOff(o => Math.min(AHEAD, o + 1))}><Icon name="chevron-right" /></button>
      </div>
      {!onBought && <ReceiptScan r={rs} phone={!wide} />}
      {summary}
      {current && carried > 0 && !onBought && <p className="note" id="groc-carried">{`Carried over ${carried} ${carried === 1 ? 'item' : 'items'} you still have from ${monthLabel(month.carried!)}.`}</p>}
      {!t.count && off === 0 && !onBought && <p className="note">Your list comes from <b>Inventory</b>. Add what you usually buy there, and tick what you already have.</p>}
      {onBought && !bought.length && !q.trim() && <p className="note" id="groc-boughtnone">Nothing bought yet this month. Tick an item on Shopping and it shows up here.</p>}
      {phoneShop
        ? <GroceryPhoneBar q={q} onQ={setQ} options={GET_SORTS} sort={sort} onSort={setSort} searchOn={list.length > 0} select={selectBtn}
          more={<GroceryMore phone><ReceiptMenu r={rs} />{detailsBtns}{skipBtn}</GroceryMore>} />
        : (onBought ? bought.length > 0 : list.length > 0) && <GroceryBar q={q} onQ={setQ} options={GET_SORTS} sort={sort} onSort={setSort} />}
      {noMatch && <NoMatch q={q} />}
      {!onBought && <RemovedNotice scope="groceryoff" />}
      {!phoneShop && (
        <div className="gtools">
          {selectBtn}
          {selecting && onBought && shown.length > 0 && <button type="button" className="btn sm ghost" id="groc-pickall" onClick={() => pickSome(pickAll, !allOn)}>{allOn ? 'Clear all' : `Select all ${pickAll.length}`}</button>}
          <GroceryMore>{detailsBtns}{skipBtn}</GroceryMore>
        </div>
      )}
      {withChips && <GroceryStoreChips chips={chips} value={chip} onChange={setChipPick} />}
      {!onBought && current && t.count > 0 && !todo.length && <p className="note" id="groc-alldone">Everything on this month’s list is bought. See it under <b>Bought</b>.</p>}
      <div className={`gshoplist${chip !== ALL_CHIP ? ' gcompact' : ''}`}>
      {shown.map((grp, gi) => {
        const gt = tally(grp.items, month); const gone = removed[grp.store]; // the tally counts a purchase of a removed item too
        if (gone && (onBought || !current)) { gt.got += gone.count; gt.count += gone.count; gt.planned += gone.cents; }
        const ids = storeIds(shown, grp.store);
        return (
          <section key={grp.store || '_'} className={`gstore${!current && gt.got === gt.count ? ' done' : ''}`} aria-labelledby={`groc-h-${gi}`}>
            <div className="gstorehead">
              <h3 id={`groc-h-${gi}`}>{grp.label}{split && grp.group && <span className="gtag"> {groupTag(grp.group)}</span>}</h3>
              <span className="gstoremeta">
                <span className="note">{onBought ? `${gt.count} bought` : current ? `${gt.count} to get` : `${gt.got}/${gt.count}`}{gt.planned ? ` · ${money(gt.planned)}` : ''}</span>
                {selecting && <button type="button" className="btn sm ghost gpickall" onClick={() => pickSome(ids, !allPicked(ids, picked))}>{allPicked(ids, picked) ? `Clear ${grp.label}` : `Select all in ${grp.label}`}</button>}
                <ExpandAll label={grp.label} all={storeRows(grp).every(i => isOpen(i.id))} onToggle={on => setOpen(storeRows(grp).map(i => i.id), on)} />
              </span>
            </div>
            {split && grp.group && <StoreMoney g={g} month={month} store={grp.store} />}
            {taxRow(grp.store)}
            <ul className="glist">{(onBought ? grp.items : gotLast(grp.items, month)).map(it => <GetRow key={it.id} g={g} item={it} month={month} mk={mk} future={onBought ? false : off > 0} carries={off >= 0} onGot={on => tick(it.id, on)} open={isOpen(it.id)} onOpen={on => setPanel(it.id, on)} onMove={id => { focusAfter.current = `groc-store-${id}`; setChipPick(ALL_CHIP); }} pick={selecting ? { on: picked.has(it.id), set: on => pickSome([it.id], on) } : undefined} />)}</ul>
            {!onBought && current && <GroceryQuickAdd idKey={String(gi)} label={grp.label} store={grp.store} onAdded={a => setQuick({ ...a, label: grp.label, every: false, t: Date.now() })} />}
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
      </div>
      <div className="gstack">
        {ticked && ticked.mk === mk && (
          <div className="gtickednote">
            <Notice kind="undo" expire={{ ms: UNDO_MS, onExpire: () => setTicked(null), key: ticked.t }}
              actions={[{ label: 'Undo', onClick: () => tick(ticked.id, false) }, ...(ticked.unpriced ? [{ label: 'Add price', onClick: () => { const id = ticked.id; setTicked(null); onAddPrice(id); } }] : []), { label: 'Dismiss', ghost: true, onClick: () => setTicked(null) }]}>
              <b>Bought</b> {ticked.name}.{ticked.unpriced && ' It has no price yet.'}
            </Notice>
          </div>
        )}
        {quick && (
          <div className="gtickednote">
            <Notice kind="undo" expire={{ ms: UNDO_MS, onExpire: () => setQuick(null), key: quick.t }}
              actions={[...(quick.every ? [] : [{ label: 'Make it every month', onClick: () => { if (!useAppStore.getState().updateGroceryItem(quick.id, { every: true })) setQuick({ ...quick, every: true, t: Date.now() }); } }]),
                { label: 'Undo', onClick: () => { useAppStore.getState().removeGroceryItem(quick.id, { quiet: true }); setQuick(null); } }, { label: 'Dismiss', ghost: true, onClick: () => setQuick(null) }]}>
              {quickAddNotice(quick.name, quick.label, quick.every)}
            </Notice>
          </div>
        )}
        <BulkShare mk={mk} selecting={selecting} picked={pickedIds} onSelecting={setSelect} onClear={() => setPicked(new Set())} />
        {!wide && <GroceryTotalBar t={t} view={mode} empty={emptyText} />}
      </div>
    </div>
  );
  if (!rail) return main;
  return (
    <div className="glayout">
      {main}
      <GroceryRail t={t} view={mode} empty={emptyText} chips={chips} value={chip} onChange={setChipPick} />
    </div>
  );
}

/* ---------- At home ---------- */
// "Have" is one tick shared with To get: a When-out item has it unless it is out (ticking it bought on To get clears "out"), and an
// Every-month item has it once it is ticked bought this month. So a tick on either list shows on the other.
function HomeRow({ item, have, bought, onHave, last }: { item: GroceryItem; have: boolean; bought: boolean; onHave: (on: boolean) => void; last: string }) {
  return (
    <li className="ghome">
      <label className="gtick">
        <input type="checkbox" className="chk" id={`groc-have-${item.id}`} aria-label={`Have ${item.n}`} checked={have} onChange={e => onHave(e.target.checked)} />
        <span className="gtickname">{item.n}{item.note && <small className="gnote">{item.note}</small>}</span>
      </label>
      {bought && <span className="gchip">Bought</span>}
      {last && <button type="button" className="ghistory" id={`groc-history-${item.id}`} aria-label={`${last}. Open price history for ${item.n}`} onClick={() => useAppStore.getState().openModal({ type: 'pricehistory', id: item.id })}>{last}</button>}
    </li>
  );
}

function EditRow({ item, g, have, onHave, adjust, open, onOpen, onMove, onRemoved }: { item: GroceryItem; g: GroceryT; have: boolean; onHave: (on: boolean) => void; adjust: boolean; open: boolean; onOpen: (on: boolean) => void; onMove: (id: string) => void; onRemoved: (id: string) => void }) {
  const s = useAppStore.getState();
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(item.n);
  const [arming, setArming] = useState(false); // Remove was pressed once
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) { setWasOpen(open); if (!open) { setName(item.n); setErr(null); } } // a rejected rename and its message do not outlive the open row
  const { mine, suggested } = storeChoices(g);
  const split = hasSharing(g);
  const w = unitWords(item.unit);
  const usualPrice = item.unit ? `Usual price per ${item.unit}` : 'Usual price each'; // this box sets the item's usual price; To get's Price each is this month's
  // One tree for closed and open, with the arrow in the same place in it, so it keeps keyboard focus when the row opens or closes. The arrow is the one
  // toggle (aria-expanded); the name beside it is a shortcut when closed and the name field when open.
  const shut = !open;
  return (
    <li className={shut ? 'gedit gedshut' : `gedit${arming ? ' removing' : ''}`}>
      <input type="checkbox" className="chk gedithave" aria-label={`Have ${item.n}`} checked={have} onChange={e => onHave(e.target.checked)} />
      {shut
        ? <button type="button" className="gedname" onClick={() => onOpen(true)}>{item.n}{item.note && <small className="gnote">{item.note}</small>}</button>
        : <input type="text" className="gname" aria-label={`Name of ${item.n}`} maxLength={80} value={name} onChange={e => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name.trim() !== item.n) setErr(s.updateGroceryItem(item.id, { n: name })); else setName(item.n); }} />}
      {shut && item.unit && <span className="gchip">by the {item.unit}</span>}
      {shut && split && item.share && <span className="gsplittag">{shareText(partiesFor(g, item))}</span>}
      <button type="button" className="garrow" id={`groc-edit-arrow-${item.id}`} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${item.n}`} onClick={() => onOpen(!open)}><Icon name={open ? 'chevron-up' : 'chevron-down'} /></button>
      {open && (<>
        <div className="gedrow">
          <input type="text" className="gnoteinput" aria-label={`Note for ${item.n}`} placeholder="Note (optional)" maxLength={MAX_NOTE} key={item.note ?? ''} defaultValue={item.note ?? ''}
            onBlur={e => { if (e.target.value.trim() !== (item.note ?? '')) setErr(s.updateGroceryItem(item.id, { note: e.target.value })); }} />
          <select id={`groc-edit-store-${item.id}`} aria-label={`Store for ${item.n}`} value={item.store} onChange={e => { onMove(item.id); setErr(s.updateGroceryItem(item.id, { store: e.target.value })); }}>
            <option value="">Anywhere</option>
            {mine.map(x => <option key={x} value={x}>{x}</option>)}
            {suggested.length > 0 && <optgroup label="Suggested">{suggested.map(x => <option key={x} value={x}>{x}</option>)}</optgroup>}
            {item.store && !mine.includes(item.store) && !suggested.includes(item.store) && <option value={item.store}>{item.store} (removed)</option>}
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
        <ReceiptNames item={item} />
        {split && (adjust || !!item.share) && <SharePicker name={item.n} people={allPeople(g)} parties={partiesFor(g, item)} own={!!item.share} onChange={sh => s.setGroceryItemShare(item.id, sh)} />}
        <ArmedButton className={`btn sm ${arming ? 'danger' : 'ghost'}`} aria-label={`Remove ${item.n} from your list`} label="Remove" armedLabel="Tap again to remove" onArmedChange={setArming} onConfirm={() => { setArming(false); onRemoved(item.id); onOpen(false); s.removeGroceryItem(item.id); }} />
        {err && <p className="note gerr" role="alert">{err}</p>}
      </>)}
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
  const [sharingSaved, setSharingSaved] = useState(false); // Done in the Sharing panel closed it: say so until it is opened again
  const [openEdit, setEdits, clearEdits] = useIdSet(); // items whose edit form is open; every item starts closed each time Edit is pressed
  const setEditMode = (on: boolean) => { setEditing(on); clearEdits(); };
  const [adjusting, setAdjust] = useIdSet(); // stores whose rows show their share controls while editing (the rest show them only when an item has its own split)
  const toggleAdjust = (store: string) => setAdjust([store], !adjusting.has(store));
  const month = months[nowKey] || emptyMonth();
  const [q, setQ] = useState('');
  const [sort, setSort] = useSortChoice('grocery-home', HOME_SORTS, DEFAULT_GROCERY_SORT);
  // A row being edited keeps its place (A to Z), so it does not jump while its name, price or tick changes; the sort and the search apply when you are not editing.
  const facts = { cents: (i: GroceryItem) => (i.cents == null ? null : lineTotal(i.qty, i.cents)), ticked: (i: GroceryItem) => haveOf(i, month) };
  const shown = editing ? byStore(g, g.items, true) : byStore(g, filterGroceryItems(g.items, q), true).map(grp => ({ ...grp, items: sortGroceryItems(grp.items, sort, facts) }));
  // A row moved to another store, or removed, drops keyboard focus to the page: keep it on the row's store select, or after a removal on the next row's arrow
  // (else the one before, else the Edit/Done button).
  const focusAfter = useRef<string | null>(null);
  useEffect(() => { if (focusAfter.current) { document.getElementById(focusAfter.current)?.focus(); focusAfter.current = null; } });
  const afterRemoved = (id: string) => {
    const order = byStore(g, g.items, true).flatMap(grp => grp.items.map(i => i.id));
    const at = order.indexOf(id); const next = order[at + 1] ?? order[at - 1];
    focusAfter.current = next ? `groc-edit-arrow-${next}` : 'groc-edit';
  };
  const hasIt = (it: GroceryItem) => haveOf(it, month);
  // Store chips (not while editing): All, and one per store with its item count. Counts ignore the search; a chip whose store has no items falls back to All.
  const rail = useMinWidth(1100);
  const homeGroups = byStore(g, g.items, true);
  const chips = chipsOf(homeGroups);
  const [chipPick, setChipPick] = useState(ALL_CHIP);
  const chip = resolveChip(chipPick, homeGroups);
  const listed = editing ? shown : chipGroups(shown, chip);
  const withChips = !editing && showChips(chips);
  const setHave = (it: GroceryItem, on: boolean) => { focusAfter.current = `groc-have-${it.id}`; useAppStore.getState().setGroceryHave(nowKey, it.id, on); }; // a sorted row may move: keep focus on its box
  const page = (
    <div className={editing ? 'gathome editing' : 'gathome'}>
      <div className="ghomehead gsharehead">
        {editing && <b className="geditbadge">Editing</b>}
        <p className="note">{editing ? 'Add, rename, move or remove what you buy.' : 'Tick what you already have this month. It leaves Shopping. On the 1st every tick clears.'}</p>
        <div className="ghomebtns">
          <button type="button" className="btn sm ghost" id="groc-sharing" aria-pressed={sharingOpen} onClick={() => { setSharingSaved(false); setSharingOpen(v => !v); }}>{sharingOpen ? 'Close sharing groups' : 'Sharing groups'}</button>
          <button type="button" className="btn sm ghost" id="groc-edit" aria-pressed={editing} onClick={() => setEditMode(!editing)}>{editing ? 'Done' : 'Edit'}</button>
        </div>
      </div>
      {!hasSharing(g) && !sharingOpen && g.items.length > 0 && (
        <p className="note gshareprompt">Buy groceries with other people? <button type="button" className="btn sm ghost" id="groc-sharing-prompt" onClick={() => setSharingOpen(true)}>Set up sharing</button></p>
      )}
      {sharingOpen && <SharingGroups g={g} onDone={() => { focusAfter.current = 'groc-sharing'; setSharingOpen(false); setSharingSaved(true); }} />}
      {sharingSaved && !sharingOpen && <p className="note" role="status">Sharing saved.</p>}
      <RemovedNotice scope="grocery" />
      {!g.items.length && !editing && (
        <EmptyTiles heading="Start your grocery list" tiles={[
          { id: 'groc-tile-add', label: 'Add an item', hint: 'Type what you buy and where', onClick: () => { focusAfter.current = 'groc-name'; setEditMode(true); } },
          { id: 'groc-tile-sharing', label: 'Set up sharing', hint: 'Split the bill with others', onClick: () => setSharingOpen(true) },
          { id: 'groc-tile-recipes', label: 'Browse recipes', hint: 'Add what a recipe needs to your list', onClick: () => { useAppStore.getState().setDailyView('recipes'); navigate(dailyFix('daily', 'recipes') ?? 'daily', 'replace'); } },
        ]} />
      )}
      {!editing && g.items.length > 0 && <GroceryBar q={q} onQ={setQ} options={HOME_SORTS} sort={sort} onSort={setSort} />}
      {!editing && !!q.trim() && !listed.length && <NoMatch q={q} />}
      {withChips && <GroceryStoreChips chips={chips} value={chip} onChange={setChipPick} />}
      <div className={editing ? `gcols ${columnsClass(shown.length)}` : `gshoplist${chip !== ALL_CHIP ? ' gcompact' : ''}`}>
      {listed.map((grp, gi) => (
        <section key={grp.store || '_'} className="gstore" aria-labelledby={`groc-home-h-${gi}`}>
          <div className="gstorehead">
            <h3 id={`groc-home-h-${gi}`}>{grp.label}{grp.group && <span className="gtag"> {groupTag(grp.group)}</span>}</h3>
            {editing
              ? <ExpandAll label={grp.label} all={grp.items.every(i => openEdit.has(i.id))} onToggle={on => setEdits(grp.items.map(i => i.id), on)} />
              : <span className="gstoremeta"><span className="note">{itemsText(grp.items.length, haveCount(grp.items, hasIt))}</span></span>}
          </div>
          {editing && hasSharing(g) && (
            <button type="button" className="btn sm ghost gadjust" aria-pressed={adjusting.has(grp.store)} onClick={() => { if (!adjusting.has(grp.store)) setEdits(grp.items.map(i => i.id), true); toggleAdjust(grp.store); }}>
              {adjusting.has(grp.store) ? `Done adjusting ${grp.label}` : `Adjust shares for ${grp.label}`}
            </button>
          )}
          <ul className="glist">{grp.items.map(it => (editing ? <EditRow key={it.id} item={it} g={g} adjust={adjusting.has(grp.store)} have={hasIt(it)} onHave={on => setHave(it, on)} open={openEdit.has(it.id)} onOpen={on => setEdits([it.id], on)} onMove={id => { focusAfter.current = `groc-edit-store-${id}`; }} onRemoved={afterRemoved} /> : <HomeRow key={it.id} item={it} have={hasIt(it)} bought={lineOf(it, month).got} onHave={on => setHave(it, on)} last={lastBoughtText(it, itemHistory(it, months), nowKey)} />))}</ul>
        </section>
      ))}
      </div>
      {editing && <Stores g={g} />}
      {editing && <EditDock g={g} onDone={() => setEditMode(false)} />}
    </div>
  );
  if (!rail) return page;
  return ( // the wrapper stays while editing (one column, no rail), so pressing Edit does not remount the page
    <div className={editing ? 'glayout gsolo' : 'glayout'}>
      <div className="gmain">{page}</div>
      {!editing && g.items.length > 0 && <InventoryRail have={haveCount(g.items, hasIt)} total={g.items.length} chips={chips} value={chip} onChange={setChipPick} />}
    </div>
  );
}

export default function Grocery() {
  const g = useAppStore(s => s.grocery);
  const months = useAppStore(s => s.groceryMonths);
  const today = useToday(s => s.today);
  const ready = useAppStore(s => s.isReady());
  const nowKey = monthKey(today);
  useEffect(() => { if (ready) useAppStore.getState().carryGroceryTicks(nowKey); }, [ready, nowKey]); // a new month starts with the At home ticks of the last one (ADR 079)
  const [chosen, setChosen] = useState<View>(() => (g.items.length ? 'shopping' : 'inventory')); // nothing to get from an empty list: start where you add
  const [monthOff, setMonthOff] = useState(0); // the month Shopping and Bought are showing, kept when you switch between them
  const [priceFor, setPriceFor] = useState<string | null>(null); // the item whose price field the tick notice's Add price opens on Bought
  const routed = pageOf(useRoutePath(), 'daily/grocery'); // #/daily/grocery/bought/history wins over the default (the old #/daily/grocery/spend lands there)
  const routedView = routed?.split('/')[0] ?? null; // `bought/history` is the Bought view's second switch
  const receiptsOn = useFeature('receipts');
  const showReceipts = routed === 'receipts' && receiptsOn; // the saved receipts page (brief receipt-save-photo): admin only, and a reload of its address falls back to the list for anyone else
  const view = (routedView && VIEWS.includes(routedView) ? routedView : chosen) as View;
  const inner: BoughtView = view === 'bought' && routed === 'bought/history' ? 'history' : 'month';
  const setView = (v: View) => { setChosen(v); navigate(`daily/grocery/${v}`, 'replace'); }; // leaving Bought, or pressing it, starts at This month
  const setInner = (v: BoughtView) => navigate(v === 'history' ? 'daily/grocery/bought/history' : 'daily/grocery/bought', 'replace');
  const counts = useMemo(() => viewCounts(g, months[nowKey] || emptyMonth()), [g, months, nowKey]);
  if (showReceipts) return <section className="panel groc" aria-labelledby="rcs-h"><Receipts /></section>;
  const tab = (v: View, label: string, n?: number) => (
    <button type="button" id={`groc-view-${v}`} className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>{label}{n !== undefined && n > 0 ? ` ${n}` : ''}</button>
  );
  return (
    <section className="panel groc" aria-labelledby="groc-h">
      <div className="gtop">
        <h2 id="groc-h">Groceries</h2>
        <div className="seg" role="group" aria-label="Grocery view">
          {tab('shopping', 'Shopping', counts.shopping)}
          {tab('bought', 'Bought', counts.bought)}
          {tab('inventory', 'Inventory')}
        </div>
      </div>
      {view === 'bought' && <GroceryBoughtTabs value={inner} onChange={setInner} />}
      <p className="note gviewsub" id="groc-sub">{SUBTITLE[view === 'bought' && inner === 'history' ? 'history' : view]}</p>
      {view === 'bought' && inner === 'history' ? <GrocerySpend nowKey={nowKey} /> : view === 'shopping' || view === 'bought' ? <ToGet key={view} g={g} months={months} nowKey={nowKey} mode={view} off0={monthOff} onOff={setMonthOff} priceFor={priceFor} onAddPrice={id => { setPriceFor(id); if (id) setView('bought'); }} /> : <AtHome g={g} months={months} nowKey={nowKey} />}
    </section>
  );
}
