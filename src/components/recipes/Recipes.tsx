import { useEffect, useMemo, useRef, useState } from 'react';
import RemovedNotice from '../RemovedNotice.jsx';
import FilterSelect from '../FilterSelect.jsx';
import ComboChips from './ComboChips.js';
import StockPill from './StockPill.js';
import { useToday } from '../../store/useToday.js';
import FoodTypeReview from './FoodTypeReview.js';
import Icon from '../Icon.js';
import RecipeDetail from './RecipeDetail.js';
import RecipeDetailPane, { useDetailPaneWidth } from './RecipeDetailPane.js';
import RecipeNewMenu, { type NewChoice } from './RecipeNewMenu.js';
import LibrarySignIn from './LibrarySignIn.js';
import FoodSections from './FoodSections.js';
import { useKept } from './useRecipesViewState.js';
import ReadyMadeForm from './ReadyMadeForm.js';
import { activeFormGuard } from '../../lib/recipeFormGuard.js';
import RecipeForm from './RecipeForm.js';
import '../Pill.css';
import './Recipes.css';
import './RecipeFind.css';
import { untypedBanner } from '../../lib/foodType.js';
import { foodMarks, type CardStock } from '../../lib/boardStock.js';
import { monthKey } from '../../lib/grocery.js';
import { ymd } from '../../shared/dates.js';
import { libraryHave } from '../../lib/libraryRows.js';
import { filtersSkipLibrary, mergedGroups } from '../../lib/recipeMerged.js';
import { comboIds, expandedRows, partsLine, sectionRows, type ComboChip } from '../../lib/recipeCombos.js';
import { alsoTag, libraryMatchCount, searchCounts, sectionAfterSave, sectionCounts, sectionEmptyNote, sectionForPath, onFoodsList, type FoodSection } from '../../lib/foodSections.js';
import { recipeFromCatalog } from '../../lib/recipeDraft.js';
import { DEFAULT_LIBRARY_SORT, DEFAULT_RECIPE_SORT, LIBRARY_SORTS, RECIPE_SORTS, activeFilterCount, filterRecipes, librarySortedBy, recipeMeta, sortRecipes, typeTag } from '../../lib/recipeList.js';
import { quickPicks } from '../../lib/recipeRecent.js';
import { loggableRecipe, recentRows } from '../../lib/recipeRows.js';
import { NUTRITION_FILTERS, nutritionBadge } from '../../lib/recipeNutrition.js';
import { pantryStatus } from '../../lib/recipePantry.js';
import { liveTags, tagCounts, visibleChips } from '../../lib/recipeTags.js';
import { RECIPE_CATEGORY_LABEL } from '../../shared/recipes.js';
import { showSavedRecipe } from '../../lib/recipesViewState.js';
import { foodSectionOf, foodSectionPath, recipesPage, recipesPagePath } from '../../lib/route.js';
import { takeRecipesJump } from '../../lib/recipesJump.js';
import { takeRecipeStart } from '../../lib/shareTarget.js';
import { useAppStore } from '../../store/useAppStore.js';
import SortControl from '../SortControl.jsx';
import { useSortChoice } from '../useSortChoice.js';
import Notice, { UNDO_MS } from '../Notice.js';
import EmptyTiles from '../EmptyTiles.js';
import { goUp, navigate, useRoutePath } from '../useRoute.js';
import { signIn as devHeaders } from '../../sync/devUser.js';
import { searchRecipes } from '../../sync/recipeCatalog.js';
import type { CatalogItem, Recipe, RecipeCategory } from '../../types.ts';

// Recipes (ADR 084): yours (Mine, synced with the account) and the library (Wikibooks Cookbook, searched on the server). Each recipe's
// ingredients are checked against Groceries, At home. Its logic is in lib/recipeList.ts, lib/recipePantry.ts and the store's recipesSlice.
type View = { kind: 'list' } | { kind: 'mine'; id: string; from?: string } | { kind: 'library'; item: CatalogItem } | { kind: 'types' } | { kind: 'form'; id?: string; ready?: boolean; start?: { title: string; url: string } | null };
const PANE_CHOICES = [{ key: 'auto', label: 'Beside the list' }, { key: 'closed', label: 'Page only' }] as const; // kept for the e2e specs only (no control; nothing in the app sets it): e2e/fixtures.js stores 'closed' so older specs keep opening a recipe as a page
const FILTER_CHOICES = [{ key: 'closed', label: 'Closed' }, { key: 'open', label: 'Open' }] as const;
const EMPTY_CHIPS = new Map<string, ComboChip[]>();
const openedThisVisit: string[] = []; // recipes opened in the list this visit, newest last (Recent chips; not stored)
type Library = { status: 'loading' } | { status: 'ready'; items: CatalogItem[]; more: boolean; key: string } | { status: 'failed'; reason: string; key: string };
const LIB_KEPT = 20; // library answers kept while Recipes is open: the newest 20 searches
const keepAnswer = (cache: Map<string, Library>, key: string, answer: Library): void => { cache.delete(key); cache.set(key, answer); if (cache.size > LIB_KEPT) cache.delete(cache.keys().next().value as string); };
const LIB_LOADING: Library = { status: 'loading' }; // one value, so the memos that read the library do not rerun on every render

export default function Recipes() {
  const recipes = useAppStore(s => s.recipes);
  const grocery = useAppStore(s => s.grocery);
  const months = useAppStore(s => s.groceryMonths);
  const syncing = useAppStore(s => s.sync !== null);
  const diet = useAppStore(s => s.diet);
  const chipCfg = useAppStore(s => s.cfg.recipeChips);
  const [view, setViewNow] = useState<View>({ kind: 'list' });
  // A recipe page or the form adds a Back step (#/daily/recipes/mine); the recipe itself is not in the address, so a reload or pasted address shows the list.
  const path = useRoutePath(), page = recipesPage(path);
  const [sec, setSec] = useKept('sec'); // the section last used this visit; the address wins when it names one
  const { section, fix } = sectionForPath(path, sec, recipes);
  const leaving = useRef(false); // Back to the list was asked and the address has not changed yet: the page address is not an address "with nothing to show"
  const pendingSec = useRef<FoodSection | null>(null); // a saved item's section: the address is rewritten to it when Back lands on the list
  const setView = (v: View) => {
    setViewNow(v);
    if (v.kind === 'list') { leaving.current = true; goUp(foodSectionPath(section)); } else navigate(recipesPagePath(v.kind), page ? 'replace' : 'push');
  };
  useEffect(() => {
    if (!page) leaving.current = false;
    if (onFoodsList(path) && pendingSec.current) { const to = pendingSec.current; pendingSec.current = null; setSec(to); navigate(foodSectionPath(to), 'replace'); return; } // Back after Save lands on the section the saved item belongs in
    if (fix && view.kind !== 'form') { navigate(fix, 'replace'); return; } // the bare address names the section shown (not while the form holds the screen: the guard below puts its entry back)
    const named = foodSectionOf(path);
    if (named && named !== sec) setSec(named); // the address wins on reload and Back
    if (page === 'form' && view.kind === 'list') { const jump = takeRecipesJump(); if (jump && (jump.kind === 'new' || useAppStore.getState().recipes.some(r => r.id === jump.id))) { setViewNow(jump.kind === 'edit' ? { kind: 'form', id: jump.id } : { kind: 'form' }); return; } } // Nutrition's New recipe and Edit in Recipes buttons
    if (page === 'form' && view.kind === 'list') { const start = takeRecipeStart(); if (start) { setViewNow({ kind: 'form', start }); return; } } // New recipe with a shared link (the share sheet)
    if (!page && onFoodsList(path) && view.kind === 'form' && activeFormGuard()?.holds()) { navigate('daily/recipes/form', 'push'); activeFormGuard()?.ask(); return; } // Back with edits or the amount picker open: stay on the form (its entry is put back), close the picker or ask
    if (page && view.kind === 'list' && !leaving.current) navigate(foodSectionPath(section), 'replace'); // an address for a page with nothing to show
    if (!page && view.kind !== 'list') setViewNow({ kind: 'list' }); // Back to the list
    if (view.kind === 'mine' && view.from && page === 'mine') setViewNow({ kind: 'mine', id: view.from }); // Back from a linked sauce to the recipe it was opened from
    if (view.kind === 'mine' && !view.from && page === 'mine/sauce') navigate('daily/recipes/mine', 'replace'); // Forward to a sauce page with nothing it was opened from
  }, [page, path, view, fix, sec, section, setSec]);
  // Opening a linked sauce is a page opened from a page: it pushes its own address, so Back returns to the recipe.
  const openLinked = (id: string, from: string) => { setViewNow({ kind: 'mine', id, from }); navigate('daily/recipes/mine/sauce', 'push'); };
  // Kept while another Daily section is open and until reload (lib/recipesViewState.ts): the source, search, tabs, filters and the recipe in the pane.
  const [q, setQ] = useKept('q');
  const [recent, setRecent] = useKept('recent'); // the Recent pill: favourites and recently used recipes instead of a type tab
  const [filtersChoice, setFiltersChoice] = useSortChoice('recipes-filters', FILTER_CHOICES, 'closed'); // closed until opened; remembered on this device
  const filtersOpen = filtersChoice === 'open';
  const [selId, setSelId] = useKept('selId'); // the recipe in the detail pane (wide screens)
  const [paneChoice] = useSortChoice('recipes-detail', PANE_CHOICES, 'auto');
  const pane = useDetailPaneWidth() && paneChoice === 'auto';
  const [cat, setCat] = useKept('cat');
  const [canMake, setCanMake] = useKept('canMake');
  const [tagSel, setTagSel] = useKept('tagSel');
  const [nutSel, setNutSel] = useKept('nutSel');
  const [mineSort, setMineSort] = useSortChoice('recipes', RECIPE_SORTS, DEFAULT_RECIPE_SORT);
  const [libSort, setLibSort] = useSortChoice('recipes-library', LIBRARY_SORTS, DEFAULT_LIBRARY_SORT);
  const [lib, setLib] = useState<Library>({ status: 'loading' });
  const [added, setAdded] = useState<{ id: string; name: string } | { error: string } | null>(null); // the last one-tap Add from the Library, for its Undo
  const [tries, setTries] = useState(0);
  const month = monthKey(new Date());
  const asked = useRef(''); // the search the library list shows; a page that arrives for an older one is dropped
  asked.current = `${q}|${cat}|${libSort}|${tries}`;
  const yours = section !== 'library'; // the Library section lists the shared catalog, not your items
  const libOn = section === 'library';
  const libRef = useRef(lib); // the page the effect below checks, so hiding and re-showing the box does not ask for the same search again
  libRef.current = lib;
  const libAsking = useRef(new Map<string, Promise<Library>>()); // searches sent and not yet answered: coming back to one of them (apple, pear, apple) waits for that request instead of sending another; a search's answer is kept even when the box has moved on to another search
  const libCache = useRef(new Map<string, Library>()); // answers kept while Recipes stays open: going back to an earlier search (or reopening the box) shows its result with no request; Retry (`tries`) is part of the key, so it asks again
  const libCopy = useMemo(() => (view.kind === 'library' ? recipeFromCatalog(view.item, []) : null), [view]);

  const chips = visibleChips(chipCfg, yours);
  const tags = useMemo(() => tagCounts(recipes), [recipes]);
  const activeTags = useMemo(() => liveTags(recipes, tagSel), [recipes, tagSel]); // a renamed or deleted tag leaves the selection
  useEffect(() => { if (activeTags.length !== tagSel.length) setTagSel(activeTags); }, [activeTags, tagSel]); // drop a renamed or deleted tag so it cannot come back selected
  useEffect(() => { if (cat && !visibleChips(chipCfg, true).includes(cat)) setCat(null); }, [cat, chipCfg]); // a chip hidden while it is the filter: the filter clears
  const status = useMemo(() => new Map(recipes.map(r => [r.id, pantryStatus(r, grocery, months[month] ?? { lines: {}, pulled: [] }, recipes)])), [recipes, grocery, months, month]);
  const today = ymd(useToday(s => s.today)); // the app clock, the same day the board's marks are worked out for
  const foodStock = useMemo(() => foodMarks(recipes, today, grocery, months), [recipes, today, grocery, months]); // the Have / Need pill of each ready-made food (lib/boardStock.ts)
  const makeable = useMemo(() => new Set([...status].filter(([, s]) => s.total > 0 && s.have === s.total).map(([id]) => id)), [status]);
  const narrowed = useMemo(() => filterRecipes(recipes, { q, cat, canMake, tags: activeTags, nutrition: nutSel }, makeable), [recipes, q, cat, canMake, activeTags, nutSel, makeable]); // before the section, so each section's count is what it would show
  const picks = quickPicks(recipes, diet, openedThisVisit, section); // read every render: the opened list lives outside React
  const recentOn = recent && picks.length > 0; // the pill is hidden, and Recent off, when nothing was starred, logged or opened
  const combos = useMemo(() => comboIds(recipes), [recipes]);
  const mineList = useMemo(() => sectionRows(narrowed, recipes, section), [narrowed, recipes, section]); // exactly the section's items, so a pill's count is its rows (a combo is also a chip on its parts)
  const shown = recentOn ? recentRows(narrowed, picks) : sortRecipes(mineList.rows, mineSort, recipes, makeable);
  const chipRows = recentOn ? EMPTY_CHIPS : mineList.chips; // Recent lists recipes as they are
  // The Library section (lib/recipeMerged.ts): library recipes you do not have yet. A library page for an older search is not shown.
  const libNow: Library = lib.status !== 'loading' && lib.key !== asked.current ? LIB_LOADING : lib; // an answer, or a failure, for an older search is not shown
  const libItems = useMemo(() => (libNow.status === 'ready' ? libNow.items : []), [libNow]);
  const libGroup = useMemo(() => mergedGroups([], recipes, libItems).library, [recipes, libItems]); // not rebuilt on every keystroke
  const libMore = libNow.status === 'ready' && libNow.more;
  const libCount = syncing && libNow.status === 'ready' ? libGroup.length : null; // blank until the library has loaded once for this search
  const secCounts = sectionCounts(narrowed, libCount, libMore);
  const searchNums = q.trim() !== '' ? searchCounts(narrowed, libraryMatchCount(syncing, libCount), libMore) : undefined; // signed out the library can never add a match, so Made's number is exact (no "+") // the other group's "n matches" while a search is typed
  const libHave = useMemo(() => new Map(libGroup.map(it => [it.id, libraryHave(it, recipes, grocery, months[month] ?? { lines: {}, pulled: [] })])), [libGroup, recipes, grocery, months, month]); // each row's "n of m at home", worked out once per change, not per render
  // The rows with "+N more" pressed. Held here, not in the chip line, so they stay open while a combo's page replaces the list on a phone;
  // folded when the section changes (owner rule, 2026-11-14) or the row has nothing more to show. No search text, section or filter is touched.
  const [openChips, setOpenChips] = useState<{ section: FoodSection; ids: readonly string[] }>({ section, ids: [] });
  const openIds = openChips.section === section ? expandedRows(openChips.ids, chipRows) : [];
  if (openChips.section !== section || openIds.length !== openChips.ids.length) setOpenChips({ section, ids: openIds });
  const toggleChips = (id: string) => setOpenChips({ section, ids: openIds.includes(id) ? openIds.filter(x => x !== id) : [...openIds, id] });
  const chipped = recipes.find(r => r.id === selId && combos.has(r.id)); // a combo opened from a chip is in the pane although it is not a row
  const selected = shown.find(r => r.id === selId) ?? chipped ?? shown[0]; // a deleted or filtered-out pick shows the list's first item

  useEffect(() => {
    if (!libOn || !syncing) return;
    const key = `${q}|${cat}|${libSort}|${tries}`;
    if (libRef.current.status !== 'loading' && libRef.current.key === key) return; // already answered for this search
    const kept = libCache.current.get(key);
    if (kept) { setLib(kept); return; } // asked before while Recipes stayed open
    let live = true;
    const t = setTimeout(() => {
      setLib({ status: 'loading' });
      let asking = libAsking.current.get(key);
      if (!asking) {
        asking = searchRecipes(q, cat, 0, libSort, devHeaders).then((r): Library => {
          libAsking.current.delete(key);
          const got: Library = r.ok ? { status: 'ready', items: r.items, more: r.more, key } : { status: 'failed', reason: r.reason, key };
          if (r.ok) keepAnswer(libCache.current, key, got); // only an answer is kept, never a failure
          return got;
        }, (): Library => { libAsking.current.delete(key); return { status: 'failed', reason: 'unreachable', key }; }); // a thrown search is a failed one, and is not reused
        libAsking.current.set(key, asking);
      }
      void asking.then(got => { if (live) setLib(got); }); // only the search the box is showing now takes the answer (`libNow` also checks the key)
    }, q ? 300 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [libOn, syncing, q, cat, libSort, tries]);
  const more = async () => {
    if (libNow.status !== 'ready') return;
    const key = asked.current, lib = libNow;
    const r = await searchRecipes(q, cat, lib.items.length, libSort, devHeaders);
    if (r.ok && key === asked.current) { const next: Library = { status: 'ready', items: [...lib.items, ...r.items.filter(i => !lib.items.some(x => x.id === i.id))], more: r.more, key }; keepAnswer(libCache.current, key, next); setLib(next); }
  };

  const back = () => setView({ kind: 'list' });
  const openCombo = (id: string) => { // a chip: the combo opens as it is, the list and its tab stay
    if (pane) setSelId(id);
    else { openedThisVisit.push(id); setView({ kind: 'mine', id }); }
  };
  /** Switch to a section: the kept section and the address follow (a swap, not a Back step); Recent is for one section, so it goes off. */
  const switchSection = (to: FoodSection) => { setSec(to); setRecent(false); if (to === 'library' && cat === 'ready') setCat(null); navigate(foodSectionPath(to), 'replace'); }; // the library has no ready-made foods, so that category filter is dropped
  const showInSection = (id: string) => { // a pick the open section does not list (a linked item, a saved one) shows in the section it belongs in
    const r = recipes.find(x => x.id === id);
    if (r && !shown.some(x => x.id === id)) { const to = sectionAfterSave(r, section); if (to !== section) switchSection(to); else { setRecent(false); setQ(''); setCat(null); setCanMake(false); setTagSel([]); setNutSel([]); } } // in this section but hidden by the search, a filter or Recent: show it
    setSelId(id);
  };
  const openRecipe = (id: string) => {
    if (pane) showInSection(id); // a pick in the pane is not recorded as opened: the Recent chips would appear or reorder under the pointer and move the list
    else { openedThisVisit.push(id); setView({ kind: 'mine', id }); }
  };
  const landsIn = (id: string): FoodSection | undefined => { // the section a saved item belongs in; the address is rewritten to it when Back reaches the list
    const r = useAppStore.getState().recipes.find(x => x.id === id);
    const to = r ? sectionAfterSave(r, section) : undefined;
    if (to && to !== section) pendingSec.current = to;
    return to;
  };
  const choose = (c: NewChoice) => {
    if (c === 'food') setView({ kind: 'form', ready: true });
    else setView({ kind: 'form' }); // Recipe or meal: one form until meals-from-foods
  };
  const [typesUndo, setTypesUndo] = useState<(() => boolean) | null>(null); // Undo for the last "Looks right"; it belongs to this visit of the list
  const banner = untypedBanner(recipes);
  const backFromSauce = () => goUp('daily/recipes/mine'); // the address change shows the recipe it was opened from (effect above)
  const mineRecipe = view.kind === 'mine' ? recipes.find(r => r.id === view.id) : undefined;
  if (view.kind === 'form') {
    const editing = recipes.find(r => r.id === view.id), done = (id: string | null) => {
      if (pane) { if (id) showSavedRecipe(id, landsIn(id)); else if (editing) setSelId(editing.id); back(); return; } // beside the list: back to the list with the recipe open in the pane
      if (id) { landsIn(id); setView({ kind: 'mine', id }); } else if (editing) setView({ kind: 'mine', id: editing.id }); else back(); // a phone: the recipe's page; Cancel from Edit returns to the recipe, from New to the list
    };
    return <section className="panel">{view.ready || editing?.cat === 'ready' ? <ReadyMadeForm recipe={editing} onDone={done} /> : <RecipeForm recipe={editing} start={view.start} onDone={done} />}</section>;
  }
  if (view.kind === 'types') return <FoodTypeReview onDone={undo => { setTypesUndo(() => undo); back(); }} onBack={back} />;
  if (view.kind === 'mine' && mineRecipe) return <RecipeDetail key={mineRecipe.id} recipe={mineRecipe} mine onBack={view.from && recipes.some(r => r.id === view.from) ? backFromSauce : back} onEdit={() => setView({ kind: 'form', id: mineRecipe.id })} onAdd={back} onOpen={id => openLinked(id, mineRecipe.id)} />;
  if (view.kind === 'library') {
    if (libCopy) return <RecipeDetail key={libCopy.id} recipe={libCopy} mine={false} onBack={back} onEdit={back} onAdd={servings => {
      useAppStore.getState().copyCatalogRecipe(view.item, servings); // an error here means it is already in Mine, which is where it opens
      const added = useAppStore.getState().recipes.find(r => r.from === view.item.id);
      if (added) setView({ kind: 'mine', id: added.id });
    }} />;
  }

  const addFromLibrary = (it: CatalogItem) => {
    const err = useAppStore.getState().copyCatalogRecipe(it);
    const copy = useAppStore.getState().recipes.find(r => r.from === it.id);
    setAdded(err ? { error: err } : copy ? { id: copy.id, name: it.name } : null);
  };

  // One compact row (brief recipes-list-compact): name and star, then the type and the macro line; the same right-hand slot holds Log or + Add, or an arrow that opens the item.
  const row = (o: { key: string; title: string; meta?: string; badge?: string | null; est?: boolean; tag?: string | null; parts?: string; chips?: readonly ComboChip[]; have?: string | null; haveAll?: boolean; stock?: CardStock | null; edited?: boolean; fav?: boolean; current?: boolean; logId?: string; addIt?: () => void; lib?: boolean; open: () => void }) => (
    <li key={o.key} className={`rc-item${o.lib ? ' rc-libitem' : ''}${o.current ? ' current' : ''}${o.chips?.length ? ' hascombos' : ''}`}>
      <button type="button" className="rc-row" onClick={o.open} aria-current={o.current ? 'true' : undefined}>
        <span className="rc-main">
          <span className="rc-title"><b id={`rc-t-${o.key}`}>{o.title}</b>{o.fav && <span className="rc-favmark" role="img" aria-label="Favorite"><Icon name="star-fill" /></span>}{o.edited && <span className="rc-edited">Edited</span>}</span>
          <span className="rc-meta">{o.tag && <span className="rc-typetag">{o.tag}</span>}{o.badge ? <span className="rc-badge">{o.badge}{o.est && <> · <span aria-hidden="true">est.</span><span className="vh"> estimated</span></>}</span> : o.meta}{o.parts && <span className="rc-parts">{o.parts}</span>}{o.have && <span className={`rc-have${o.haveAll ? ' all' : ''}`}>{o.have}</span>}<StockPill stock={o.stock} /></span>
        </span>
        {!o.logId && !o.addIt && <span className="rc-go" aria-hidden="true"><Icon name="chevron-right" /></span>}
      </button>
      {o.logId && <button type="button" className="btn sm rc-log" aria-describedby={`rc-t-${o.key}`} onClick={() => useAppStore.getState().openModal({ type: 'portion', id: o.logId! })}>Log</button>}
      {o.addIt && <button type="button" className="btn sm rc-log rc-add" aria-label={`Add to Mine ${o.title}`} onClick={o.addIt}>Add to Mine</button>}
      {o.chips?.length ? <ComboChips food={o.title} chips={o.chips} expanded={openIds.includes(o.key)} onToggle={() => toggleChips(o.key)} onOpen={openCombo} /> : null}
    </li>
  );


  const nFilters = activeFilterCount({ cat, canMake, tags: activeTags, nutrition: nutSel }, yours); // shown on the Filters button, so a closed bar still says filters are on
  const clearFilters = () => { setCat(null); if (yours) { setCanMake(false); setTagSel([]); setNutSel([]); } }; // the Library source shows only the category: keep what Mine has set
  const libSection = (
    <section className="rc-libsec" id="recipes-library-box" aria-label="Library">
      <p className="note rc-libnote">Ready recipes from the Wikibooks Cookbook, not in your recipes yet. Add to Mine copies one into your recipes.{filtersSkipLibrary(nutSel, activeTags) ? ' Your nutrition and tag filters do not apply here.' : ''}</p>
      {!syncing && <LibrarySignIn />}
      {syncing && <div className="rc-sort"><SortControl options={LIBRARY_SORTS} value={libSort} onChange={setLibSort} /><span className="rc-sortedby">{librarySortedBy(libSort, q)}</span></div>}
      {syncing && libNow.status === 'loading' && <p className="note" role="status">Loading recipes…</p>}
      {syncing && libNow.status === 'failed' && <p className="note gerr" role="alert">{libNow.reason === 'offline' ? 'You’re offline. The library needs a connection.' : 'Couldn’t load the library.'} <button type="button" className="btn sm" onClick={() => setTries(tries + 1)}>Try again</button></p>}
      {syncing && libNow.status === 'ready' && !libNow.items.length && <p className="note">No library recipe matches.</p>}
      {syncing && libNow.status === 'ready' && libNow.items.length > 0 && !libGroup.length && <p className="note">{sectionEmptyNote('library', false)}</p>}
      {syncing && libNow.status === 'ready' && (
        <>
          <ul className="rc-list rc-cards">
            {libGroup.map(it => {
              const have = libHave.get(it.id) ?? null;
              return row({ key: it.id, title: it.name, meta: recipeMeta(RECIPE_CATEGORY_LABEL[it.data.recipe!.cat], it.data.recipe!.servings, it.data.recipe!.minutes), badge: it.data.recipe!.est ? nutritionBadge(it.data.recipe!) : null, est: !!it.data.recipe!.est, have: have ? `${have.text} at home` : null, haveAll: !!have?.all, lib: true, addIt: () => addFromLibrary(it), open: () => setView({ kind: 'library', item: it }) });
            })}
          </ul>
          {libNow.more && <div className="rc-actions"><button type="button" className="btn" onClick={() => void more()}>Show more</button></div>}
          <p className="rc-attrib">Library recipes are from the Wikibooks Cookbook, CC BY-SA 4.0.</p>
        </>
      )}
    </section>
  );

  return (
    <section className="panel" aria-labelledby="recipes-h">
      <div className="rc-titlebar">
        <h2 id="recipes-h" tabIndex={-1}>Foods</h2>
        <RecipeNewMenu onChoose={choose} />
      </div>
      <div className="rc-top">
        <input type="search" aria-label="Search recipes" placeholder="Search by name or ingredient" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
        <button type="button" className="rc-filtertoggle" id="recipes-filters" aria-expanded={filtersOpen} aria-controls="recipes-filterbar" onClick={() => setFiltersChoice(filtersOpen ? 'closed' : 'open')}><Icon name="filter" /> Filters{nFilters > 0 ? ` (${nFilters})` : ''}<Icon name={filtersOpen ? 'chevron-up' : 'chevron-down'} /></button>
      </div>
      <FoodSections section={section} counts={secCounts} search={searchNums} onSection={switchSection} recent={picks.length && yours ? { on: recentOn, onToggle: () => setRecent(!recentOn) } : undefined} />
      <div className="rc-filterbar" id="recipes-filterbar" hidden={!filtersOpen}>
        <FilterSelect label="Category" value={cat ?? ''} onChange={v => setCat(v === '' ? null : v as RecipeCategory)}>
          <option value="">All categories</option>
          {chips.map(c => <option key={c} value={c}>{RECIPE_CATEGORY_LABEL[c]}</option>)}
        </FilterSelect>
        <div className="rc-chips">
          {yours && <button type="button" aria-pressed={canMake} onClick={() => setCanMake(!canMake)}>Can make</button>}
          <button type="button" className="rc-manage" onClick={() => useAppStore.getState().openModal({ type: 'recipefilters' })}>Manage filters</button>
          {nFilters > 0 && <button type="button" id="recipes-clear-filters" onClick={clearFilters}>Clear filters</button>}
        </div>
        {yours && tags.length > 0 && (
          <div className="rc-chips" role="group" aria-label="Tags">
            {tags.map(t => {
              const on = activeTags.some(a => a.toLowerCase() === t.tag.toLowerCase());
              return <button type="button" key={t.tag} aria-pressed={on} onClick={() => setTagSel(on ? activeTags.filter(a => a.toLowerCase() !== t.tag.toLowerCase()) : [...activeTags, t.tag])}>{t.tag}</button>;
            })}
          </div>
        )}
        {yours && (
          <div className="rc-chips" role="group" aria-label="Nutrition">
            {NUTRITION_FILTERS.map(f => {
              const on = nutSel.includes(f.key);
              return <button type="button" key={f.key} aria-pressed={on} onClick={() => setNutSel(on ? nutSel.filter(k => k !== f.key) : [...nutSel, f.key])}>{f.label}</button>;
            })}
          </div>
        )}
        {yours && <div className="rc-sort"><SortControl options={RECIPE_SORTS} value={mineSort} onChange={setMineSort} /></div>}
      </div>
      <RemovedNotice scope="recipes" />
      {typesUndo && (
        <Notice kind="undo" className="removednote" expire={{ ms: UNDO_MS, onExpire: () => setTypesUndo(null) }} actions={[{ label: 'Undo', onClick: () => { typesUndo(); setTypesUndo(null); } }, { label: 'Dismiss', onClick: () => setTypesUndo(null), ghost: true }]}>
          Food types saved.
        </Notice>
      )}
      {added && ('error' in added ? (
        <p className="note gerr" role="alert">{added.error} <button type="button" className="btn sm" onClick={() => setAdded(null)}>Dismiss</button></p>
      ) : (
        <Notice kind="undo" className="removednote" expire={{ ms: UNDO_MS, onExpire: () => setAdded(null) }} actions={[{ label: 'Open', onClick: () => { setView({ kind: 'mine', id: added.id }); setAdded(null); } }, { label: 'Undo', onClick: () => { useAppStore.getState().undoCatalogCopy(added.id); setAdded(null); } }, { label: 'Dismiss', onClick: () => setAdded(null), ghost: true }]}>
          {added.name} added to Mine.
        </Notice>
      ))}
      {yours && banner && (
        <Notice kind="suggestion" actions={[{ label: 'Review types', onClick: () => setView({ kind: 'types' }) }]}>{banner}</Notice>
      )}

      {yours && !recipes.length && (
        <EmptyTiles heading="Add your first recipe" tiles={[
          { id: 'rc-tile-new', label: 'Write a recipe', hint: 'Your own, ingredient by ingredient', onClick: () => setView({ kind: 'form' }) },
          { id: 'rc-tile-library', label: 'Browse the Library', hint: 'Copy a ready recipe into Mine', onClick: () => switchSection('library') },
        ]} />
      )}
      {yours && recipes.length > 0 && !shown.length && <p className="note" id="recipes-empty">{recentOn ? 'Nothing recent matches. Clear the search or the filters.' : sectionEmptyNote(section, !!q || !!cat || canMake || activeTags.length > 0 || nutSel.length > 0)} {(nFilters > 0 || q) && <button type="button" className="btn sm" id="recipes-clear-empty" onClick={() => { clearFilters(); if (q) setQ(''); }}>{q ? (nFilters > 0 ? 'Clear search and filters' : 'Clear search') : 'Clear filters'}</button>}</p>}
      <div className={pane && yours ? 'rc-split' : undefined}>
        <div className="rc-merged">
          {yours && (
            <ul className="rc-list rc-cards">
              {shown.map((r: Recipe) => {
                const also = r.cat === 'ready' ? alsoTag(r, section) : '';
                return row({ key: r.id, title: r.n, meta: recipeMeta(RECIPE_CATEGORY_LABEL[r.cat], r.cat === 'ready' ? undefined : r.servings, r.minutes), badge: nutritionBadge(r), est: !!r.est, stock: foodStock.get(r.id), tag: also || typeTag(r), ...(combos.has(r.id) ? { parts: partsLine(r, recipes, combos) } : {}), ...(chipRows.has(r.id) ? { chips: chipRows.get(r.id)! } : {}), edited: !!r.edited, fav: !!r.fav, current: pane && selected?.id === r.id, ...(loggableRecipe(r) ? { logId: r.id } : {}), open: () => openRecipe(r.id) });
              })}
            </ul>
          )}
          {!yours && libSection}
        </div>
        {pane && yours && recipes.length > 0 && <RecipeDetailPane recipe={selected} onEdit={id => setView({ kind: 'form', id })} onGone={() => setSelId(null)} onOpen={showInSection} />}
      </div>
    </section>
  );
}
