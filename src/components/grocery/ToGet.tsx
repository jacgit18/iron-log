import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { byStore, carriedCount, emptyMonth, gotLast, groupTag, inMonth, lineCost, lineOf, money, monthLabel, onList, own, removedBought, shiftMonth, tally, untickBlock, usedOneTime } from '../../lib/grocery.js';
import { DEFAULT_GROCERY_SORT, GET_SORTS, filterGroceryItems, sortGroceryItems } from '../../lib/grocerySort.js';
import { hasSharing } from '../../lib/grocerySettle.js';
import { removedBoughtByStore } from '../../lib/groceryRemoved.js';
import { allIds, allPicked, boughtRows, storeIds } from '../../lib/groceryBought.js';
import { ALL_CHIP, DETAILS_CHOICES, chipGroups, chipsOf, detailsStartOpen, hasNoPrice, resolveChip, showChips } from '../../lib/groceryChips.js';
import { boughtSummaryText, getSummaryText } from '../../lib/groceryListSummary.js';
import { quickAddNotice } from '../../lib/groceryQuickAdd.js';
import ArmedButton from '../ArmedButton.jsx';
import BulkShare, { SelectButton } from './BulkShare.js';
import GroceryBar, { NoMatch } from './GroceryBar.js';
import GroceryBudget from './GroceryBudget.js';
import GroceryMore from './GroceryMore.js';
import GroceryPhoneBar from './GroceryPhoneBar.js';
import GroceryQuickAdd from './GroceryQuickAdd.js';
import GroceryRail from './GroceryRail.js';
import GroceryStoreChips from './GroceryStoreChips.js';
import GroceryTotalBar from './GroceryTotalBar.js';
import useMinWidth from './useMinWidth.js';
import GrocerySummary from './GrocerySummary.js';
import Icon from '../Icon.jsx';
import { motionOK } from '../../lib/motion.js';
import Notice, { UNDO_MS } from '../Notice.jsx';
import RemovedNotice from '../RemovedNotice.jsx';
import ReceiptScan, { ReceiptMenu, useReceiptScan } from './ReceiptScan.js';
import SplitSection from './SplitSection.js';
import StoreTax from './StoreTax.js';
import { StoreMoney } from './StoreMoney.js';
import { useSortChoice } from '../useSortChoice.js';
import type { Grocery as GroceryT, GroceryItem, GroceryMonth } from '../../types.ts';
import ListSummary from './ListSummary.js';
import GetRow from './GetRow.js';
import useIdSet from './useIdSet.js';

const AHEAD = 12; // how many months past this one you can plan

export default function ToGet({ g, months, nowKey, mode, off0, onOff, priceFor, onAddPrice }: { g: GroceryT; months: Record<string, GroceryMonth>; nowKey: string; mode: 'shopping' | 'bought'; off0: number; onOff: (off: number) => void; priceFor: string | null; onAddPrice: (id: string | null) => void }) {
  const split = hasSharing(g);
  const onBought = mode === 'bought';
  const [off, setOffNow] = useState(off0); // months from this one: below 0 is history, above 0 is planning ahead
  const mk = shiftMonth(nowKey, off);
  const month = months[mk] || emptyMonth();
  const list = inMonth(g, onList(g, month, off >= 0, usedOneTime(g, months)), month); // each item sits under the store it is bought at this month (Move to)
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
  const [blocked, setBlocked] = useState<string | null>(null); // why an untick was refused (a one-time item would come back as a twin)
  const [quick, setQuick] = useState<{ id: string; name: string; label: string; t: number } | null>(null); // the item just quick-added, for its notice (Undo)
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
    const why = on ? null : untickBlock(g, months, mk, id); // a used one-time item would come back beside another with its name: say so instead (brief quickadd-one-time-items)
    setBlocked(why);
    if (why) return;
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
      {detailsChoice !== 'auto' && <button type="button" className="btn sm ghost" id="groc-details-auto" onClick={() => { clearToggled(); setDetailsChoice('auto'); }}>Details by screen size</button>}
    </>
  );
  const skipBtn = !onBought && current && todo.length > 0 && !q.trim() && ( // not while a search hides rows: it would skip items you cannot see
    <ArmedButton className={`btn sm ${armingSkip ? 'danger' : 'ghost'}`} id="groc-skipall" aria-label={`Skip the ${todo.length} left: every item still to get this month`} label={`Skip the ${todo.length} left`} armedLabel={`Tap again to skip ${todo.length}`}
      onArmedChange={setArmingSkip} onConfirm={() => { setArmingSkip(false); useAppStore.getState().takeGroceryAllOff(mk); }} />
  );
  const sum = shown.reduce((a, grp) => { // what is on screen, a bought-then-removed item still counted in its store (as in the old store headings)
    const gt = tally(grp.items, month); const gone = removed[grp.store];
    if (gone && (onBought || !current)) { gt.got += gone.count; gt.count += gone.count; gt.planned += gone.cents; }
    return { count: a.count + gt.count, got: a.got + gt.got, cents: a.cents + gt.planned };
  }, { count: 0, got: 0, cents: 0 });
  const summaryText = onBought ? boughtSummaryText(sum.count, sum.cents) : current ? getSummaryText(sum.count, sum.cents) : `${sum.got}/${sum.count} bought${sum.cents ? ` · ${money(sum.cents)}` : ''}`;
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
      <GroceryBudget spent={t.spent} planned={t.planned} />
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
      {shown.length > 0 && <ListSummary text={summaryText} all={shown.every(grp => storeRows(grp).every(i => isOpen(i.id)))} onToggle={on => { clearToggled(); setDetailsChoice(on ? 'open' : 'closed'); }} />}
      <div className={`gshoplist${chip !== ALL_CHIP ? ' gcompact' : ''}`}>
      {shown.map((grp, gi) => {
        const gt = tally(grp.items, month); const gone = removed[grp.store]; // the tally counts a purchase of a removed item too
        if (gone && (onBought || !current)) { gt.got += gone.count; gt.count += gone.count; gt.planned += gone.cents; }
        const ids = storeIds(shown, grp.store);
        return (
          <section key={grp.store || '_'} className={`gstore${!current && gt.got === gt.count ? ' done' : ''}`} aria-labelledby={`groc-h-${gi}`}>
            <div className="gstorehead">
              <h3 id={`groc-h-${gi}`}>{grp.label}{split && grp.group && <span className="gtag"> {groupTag(grp.group)}</span>}</h3>
              {selecting && <span className="gstoremeta"><button type="button" className="btn sm ghost gpickall" onClick={() => pickSome(ids, !allPicked(ids, picked))}>{allPicked(ids, picked) ? `Clear ${grp.label}` : `Select all in ${grp.label}`}</button></span>}
            </div>
            {split && grp.group && <StoreMoney g={g} month={month} store={grp.store} />}
            {taxRow(grp.store)}
            <ul className="glist">{(onBought ? grp.items : gotLast(grp.items, month)).map(it => <GetRow key={it.id} g={g} item={it} month={month} mk={mk} future={onBought ? false : off > 0} carries={off >= 0} onGot={on => tick(it.id, on)} open={isOpen(it.id)} onOpen={on => setPanel(it.id, on)} onMove={id => { focusAfter.current = `groc-store-${id}`; setChipPick(ALL_CHIP); }} pick={selecting ? { on: picked.has(it.id), set: on => pickSome([it.id], on) } : undefined} />)}</ul>
            {!onBought && current && <GroceryQuickAdd idKey={String(gi)} label={grp.label} store={grp.store} onAdded={a => setQuick({ ...a, label: grp.label, t: Date.now() })} />}
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
        {blocked && (
          <div className="gtickednote">
            <Notice kind="warning" actions={[{ label: 'Dismiss', ghost: true, onClick: () => setBlocked(null) }]}>{blocked}</Notice>
          </div>
        )}
        {quick && (
          <div className="gtickednote">
            <Notice kind="undo" expire={{ ms: UNDO_MS, onExpire: () => setQuick(null), key: quick.t }}
              actions={[{ label: 'Undo', onClick: () => { useAppStore.getState().removeGroceryItem(quick.id, { quiet: true }); setQuick(null); } }, { label: 'Dismiss', ghost: true, onClick: () => setQuick(null) }]}>
              {quickAddNotice(quick.name, quick.label)}
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
