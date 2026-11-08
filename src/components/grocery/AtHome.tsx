import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { byStore, emptyMonth, groupTag, haveOf, lineOf, lineTotal, withoutUsed } from '../../lib/grocery.js';
import { itemHistory, lastBoughtText } from '../../lib/itemHistory.js';
import { DEFAULT_GROCERY_SORT, HOME_SORTS, filterGroceryItems, sortGroceryItems } from '../../lib/grocerySort.js';
import { hasSharing } from '../../lib/grocerySettle.js';
import { isCollapsed, toggleFolded, unfoldGrown } from '../../lib/groceryCollapse.js';
import { editSummaryText } from '../../lib/groceryListSummary.js';
import { ALL_CHIP, chipGroups, chipsOf, haveCount, resolveChip, showChips } from '../../lib/groceryChips.js';
import { boughtMonthText, homeFilterChips, homeFilterEmpty, homeFilterItems, toBuyText, type HomeFilter } from '../../lib/groceryHomeState.js';
import { dailyFix } from '../../lib/route.js';
import EmptyTiles from '../EmptyTiles.js';
import { navigate } from '../useRoute.js';
import GroceryBar, { NoMatch } from './GroceryBar.js';
import InventoryRail from './InventoryRail.js';
import GroceryStoreChips from './GroceryStoreChips.js';
import useMinWidth from './useMinWidth.js';
import Icon from '../Icon.jsx';
import RemovedNotice from '../RemovedNotice.jsx';
import SharingGroups from './SharingGroups.js';
import { useSortChoice } from '../useSortChoice.js';
import type { Grocery as GroceryT, GroceryItem, GroceryMonth } from '../../types.ts';
import EditDock from './EditDock.js';
import EditRow from './EditRow.js';
import ListSummary from './ListSummary.js';
import HomeRow from './HomeRow.js';
import Stores from './StoresPanel.js';
import useIdSet from './useIdSet.js';

export default function AtHome({ g: all, months, nowKey }: { g: GroceryT; months: Record<string, GroceryMonth>; nowKey: string }) {
  const [editing, setEditing] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false); // the Sharing panel (groups and who is in them) above the list, reachable without Edit
  const [sharingSaved, setSharingSaved] = useState(false); // Done in the Sharing panel closed it: say so until it is opened again
  const [openEdit, setEdits, clearEdits] = useIdSet(); // items whose edit form is open; every item starts closed each time Edit is pressed
  const g = useMemo(() => withoutUsed(all, months, editing ? openEdit : undefined), [all, months, editing, openEdit]); // a one-time item that was bought is out of Inventory, but its row stays while it is open in Edit (brief quickadd-one-time-items)
  const [folded, setFolded] = useState<Set<string>>(new Set()); // stores folded to their header while editing; every store starts open each time Edit is pressed
  const setEditMode = (on: boolean) => { setEditing(on); clearEdits(); setFolded(new Set()); };
  const [adjusting, setAdjust] = useIdSet(); // stores whose rows show their share controls while editing (the rest show them only when an item has its own split)
  const toggleAdjust = (store: string) => setAdjust([store], !adjusting.has(store));
  const month = months[nowKey] || emptyMonth();
  const [q, setQ] = useState('');
  const [sort, setSort] = useSortChoice('grocery-home', HOME_SORTS, DEFAULT_GROCERY_SORT);
  // A row being edited keeps its place (A to Z), so it does not jump while its name, price or tick changes: the search applies while editing (a row that is open stays listed, so renaming it does not drop it), the sort does not.
  const facts = { cents: (i: GroceryItem) => (i.cents == null ? null : lineTotal(i.qty, i.cents)), ticked: (i: GroceryItem) => haveOf(i, month) };
  const hits = new Set(filterGroceryItems(g.items, q).map(i => i.id));
  const shown = editing ? byStore(g, g.items.filter(i => hits.has(i.id) || openEdit.has(i.id)), true) : byStore(g, filterGroceryItems(g.items, q), true).map(grp => ({ ...grp, items: sortGroceryItems(grp.items, sort, facts) }));
  // A row moved to another store, or removed, drops keyboard focus to the page: keep it on the row's store select, or after a removal on the next row's arrow
  // (else the one before, else the Edit/Done button).
  const focusAfter = useRef<string | null>(null);
  useEffect(() => { if (focusAfter.current) { document.getElementById(focusAfter.current)?.focus(); focusAfter.current = null; } });
  const afterRemoved = (id: string) => {
    const order = listed.filter(grp => !isCollapsed(folded, grp.store, q)).flatMap(grp => grp.items.map(i => i.id)); // only rows on screen can take focus: not another chip's, a search miss or a folded store
    const at = order.indexOf(id); const next = order[at + 1] ?? order[at - 1];
    focusAfter.current = next ? `groc-edit-arrow-${next}` : 'groc-edit';
  };
  const hasIt = (it: GroceryItem) => haveOf(it, month);
  // Store chips (kept across Edit and Done): All, and one per store with its item count. Counts ignore the search; a chip whose store has no items falls back to All.
  const rail = useMinWidth(1100);
  const homeGroups = byStore(g, g.items, true);
  const chips = chipsOf(homeGroups);
  const [chipPick, setChipPick] = useState(ALL_CHIP);
  const chip = resolveChip(chipPick, homeGroups);
  const [homeFilter, setHomeFilter] = useState<HomeFilter>('all'); // Need / Have / All: a filter on the tick, not a screen, so no address; it starts at All each time Inventory opens
  const filterOn = !editing && homeFilter !== 'all' && g.items.length > 0; // no items: no chip row to clear a filter with, so it does not apply
  const listed = chipGroups(shown, chip).map(grp => (filterOn ? { ...grp, items: homeFilterItems(grp.items, hasIt, homeFilter) } : grp)).filter(grp => !filterOn || grp.items.length > 0);
  const filterChips = homeFilterChips(g.items, hasIt);
  const withChips = showChips(chips);
  const counts = new Map(homeGroups.map(grp => [grp.store, grp.items.length] as const));
  const countsKey = [...counts].join('|');
  const prevCounts = useRef(counts);
  useEffect(() => { // an item added to a folded store opens it, so the new row is seen
    setFolded(f => (f.size ? unfoldGrown(f, prevCounts.current, counts) : f));
    prevCounts.current = counts;
  }, [countsKey]); // eslint-disable-line react-hooks/exhaustive-deps -- `counts` is rebuilt every render; its text is the real dependency
  const setHave = (it: GroceryItem, on: boolean) => {
    const order = listed.flatMap(grp => grp.items.map(i => i.id)); // under Need or Have the ticked row leaves the list: focus the next row here, else the one before, else Edit
    const at = order.indexOf(it.id); const next = order[at + 1] ?? order[at - 1];
    focusAfter.current = filterOn ? (next ? `groc-have-${next}` : 'groc-edit') : `groc-have-${it.id}`;
    useAppStore.getState().setGroceryHave(nowKey, it.id, on);
  }; // a sorted row may move: keep focus on its box
  const railOn = rail && g.items.length > 0;
  const page = (
    <div className={editing ? 'gathome editing' : 'gathome'}>
      <div className="ghomehead gsharehead">
        {editing && <b className="geditbadge">Editing</b>}
        <p className="note">{editing ? 'Add, rename, move or remove what you buy.' : 'Ticks carry into next month. Untick an item when you run out, and it comes back to Shopping.'}</p>
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
      {g.items.length > 0 && (editing ? <GroceryBar q={q} onQ={setQ} /> : <GroceryBar q={q} onQ={setQ} options={HOME_SORTS} sort={sort} onSort={setSort} />)}
      {!!q.trim() && !listed.length && <NoMatch q={q} />}
      {g.items.length > 0 && !editing && <GroceryStoreChips chips={filterChips} value={homeFilter} onChange={k => setHomeFilter(k as HomeFilter)} label="Show" />}
      {withChips && <GroceryStoreChips chips={chips} value={chip} onChange={setChipPick} />}
      {filterOn && !listed.length && !q.trim() && <p className="note" id="groc-home-filter-empty">{homeFilterEmpty(homeFilter, chip !== ALL_CHIP ? chips.find(c => c.key === chip)?.label : undefined)}</p>}
      {editing && listed.length > 0 && <ListSummary text={editSummaryText(listed.reduce((n, grp) => n + grp.items.length, 0), listed.reduce((n, grp) => n + haveCount(grp.items, hasIt), 0))} all={listed.every(grp => grp.items.every(i => openEdit.has(i.id)))} onToggle={on => setEdits(listed.flatMap(grp => grp.items.map(i => i.id)), on)} />}
      <div className={`gshoplist${chip !== ALL_CHIP && !editing ? ' gcompact' : ''}`}>
      {listed.map((grp, gi) => (
        <section key={grp.store || '_'} className="gstore" aria-labelledby={`groc-home-h-${gi}`}>
          <div className="gstorehead">
            <h3 id={`groc-home-h-${gi}`}>
              {editing
                ? <button type="button" className="gfold" id={`groc-fold-${gi}`} aria-expanded={!isCollapsed(folded, grp.store, q)} aria-label={`${grp.label}, ${grp.items.length} ${grp.items.length === 1 ? 'item' : 'items'}`} onClick={() => setFolded(f => toggleFolded(f, grp.store))}><Icon name={isCollapsed(folded, grp.store, q) ? 'chevron-down' : 'chevron-up'} />{grp.label}</button>
                : grp.label}
              {grp.group && <span className="gtag"> {groupTag(grp.group)}</span>}
            </h3>
            {editing
              ? null
              : <span className="gstoremeta"><span className="note">{toBuyText(grp.items.length, haveCount(grp.items, hasIt))}</span></span>}
          </div>
          {editing && hasSharing(g) && !isCollapsed(folded, grp.store, q) && (
            <button type="button" className="btn sm ghost gadjust" aria-pressed={adjusting.has(grp.store)} onClick={() => { if (!adjusting.has(grp.store)) setEdits(grp.items.map(i => i.id), true); toggleAdjust(grp.store); }}>
              {adjusting.has(grp.store) ? `Done adjusting ${grp.label}` : `Adjust shares for ${grp.label}`}
            </button>
          )}
          <ul className="glist" hidden={editing && isCollapsed(folded, grp.store, q)}>{grp.items.map(it => (editing ? <EditRow key={it.id} item={it} g={g} adjust={adjusting.has(grp.store)} have={hasIt(it)} onHave={on => setHave(it, on)} open={openEdit.has(it.id)} onOpen={on => setEdits([it.id], on)} onMove={id => { focusAfter.current = `groc-edit-store-${id}`; setChipPick(ALL_CHIP); }} onRemoved={afterRemoved} /> : <HomeRow key={it.id} item={it} have={hasIt(it)} boughtText={lineOf(it, month).got ? boughtMonthText(nowKey) : ''} onHave={on => setHave(it, on)} last={lastBoughtText(it, itemHistory(it, months), nowKey)} />))}</ul>
        </section>
      ))}
      </div>
      {editing && !railOn && <Stores g={g} />}
      {editing && <EditDock g={g} onDone={() => setEditMode(false)} onAdded={() => { setChipPick(ALL_CHIP); setQ(''); }} />}
    </div>
  );
  if (!rail) return page;
  return ( // the wrapper stays while editing (the rail holds the Stores panel), so pressing Edit does not remount the page
    <div className={railOn ? 'glayout' : 'glayout gsolo'}>
      <div className="gmain">{page}</div>
      {railOn && editing && <aside className="grail" aria-label="Manage stores"><Stores g={g} /></aside>}
      {railOn && !editing && <InventoryRail have={haveCount(g.items, hasIt)} total={g.items.length} chips={chips} value={chip} onChange={setChipPick} />}
    </div>
  );
}
