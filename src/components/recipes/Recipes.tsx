import { useEffect, useMemo, useRef, useState } from 'react';
import RemovedNotice from '../RemovedNotice.jsx';
import FilterSelect from '../FilterSelect.jsx';
import FoodTypeReview from './FoodTypeReview.js';
import Icon from '../Icon.js';
import RecipeDetail from './RecipeDetail.js';
import RecipeDetailPane, { useDetailPaneWidth } from './RecipeDetailPane.js';
import RecipeNewMenu, { type NewChoice } from './RecipeNewMenu.js';
import LibrarySignIn from './LibrarySignIn.js';
import RecipeTypeTabs from './RecipeTypeTabs.js';
import { useKept } from './useRecipesViewState.js';
import ReadyMadeForm from './ReadyMadeForm.js';
import RecipeForm from './RecipeForm.js';
import '../Pill.css';
import './Recipes.css';
import './RecipeFind.css';
import { untypedBanner } from '../../lib/foodType.js';
import { monthKey } from '../../lib/grocery.js';
import { LIBRARY_TABS, inLibraryTab, inMine, libraryEmptyNote, libraryHave, type LibraryTab } from '../../lib/libraryRows.js';
import { recipeFromCatalog } from '../../lib/recipeDraft.js';
import { DEFAULT_LIBRARY_SORT, DEFAULT_RECIPE_SORT, LIBRARY_SORTS, RECIPE_SORTS, emptyTabNote, filterRecipes, inTab, librarySortedBy, recipeMeta, sortRecipes, tabCounts, typeTag } from '../../lib/recipeList.js';
import { quickPicks } from '../../lib/recipeRecent.js';
import { loggableRecipe, recentRows } from '../../lib/recipeRows.js';
import { NUTRITION_FILTERS, nutritionBadge } from '../../lib/recipeNutrition.js';
import { pantryStatus } from '../../lib/recipePantry.js';
import { liveTags, tagCounts, visibleChips } from '../../lib/recipeTags.js';
import { RECIPE_CATEGORY_LABEL } from '../../shared/recipes.js';
import { showSavedRecipe } from '../../lib/recipesViewState.js';
import { pageOf } from '../../lib/route.js';
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
type View = { kind: 'list' } | { kind: 'mine'; id: string; from?: string } | { kind: 'library'; item: CatalogItem } | { kind: 'types' } | { kind: 'form'; id?: string; ready?: boolean; scan?: boolean; start?: { title: string; url: string } | null };
const PANE_CHOICES = [{ key: 'auto', label: 'Beside the list' }, { key: 'closed', label: 'Page only' }] as const; // no control yet: e2e/fixtures.js stores 'closed' so older specs keep opening a recipe as a page
const FILTER_CHOICES = [{ key: 'closed', label: 'Closed' }, { key: 'open', label: 'Open' }] as const;
const openedThisVisit: string[] = []; // recipes opened in the list this visit, newest last (Recent chips; not stored)
type Library = { status: 'loading' } | { status: 'ready'; items: CatalogItem[]; more: boolean } | { status: 'failed'; reason: string };

export default function Recipes() {
  const recipes = useAppStore(s => s.recipes);
  const grocery = useAppStore(s => s.grocery);
  const months = useAppStore(s => s.groceryMonths);
  const syncing = useAppStore(s => s.sync !== null);
  const diet = useAppStore(s => s.diet);
  const chipCfg = useAppStore(s => s.cfg.recipeChips);
  const [view, setViewNow] = useState<View>({ kind: 'list' });
  // A recipe page or the form adds a Back step (#/daily/recipes/mine); the recipe itself is not in the address, so a reload or pasted address shows the list.
  const page = pageOf(useRoutePath(), 'daily/recipes');
  const setView = (v: View) => {
    setViewNow(v);
    if (v.kind === 'list') goUp('daily/recipes'); else navigate(`daily/recipes/${v.kind}`, page ? 'replace' : 'push');
  };
  useEffect(() => {
    if (page === 'form' && view.kind === 'list') { const jump = takeRecipesJump(); if (jump && (jump.kind === 'new' || useAppStore.getState().recipes.some(r => r.id === jump.id))) { setViewNow(jump.kind === 'edit' ? { kind: 'form', id: jump.id } : { kind: 'form' }); return; } } // Nutrition's New recipe and Edit in Recipes buttons
    if (page === 'form' && view.kind === 'list') { const start = takeRecipeStart(); if (start) { setViewNow({ kind: 'form', start }); return; } } // New recipe with a shared link (the share sheet)
    if (page && view.kind === 'list') navigate('daily/recipes', 'replace'); // an address for a page with nothing to show
    if (!page && view.kind !== 'list') setViewNow({ kind: 'list' }); // Back to the list
    if (view.kind === 'mine' && view.from && page === 'mine') setViewNow({ kind: 'mine', id: view.from }); // Back from a linked sauce to the recipe it was opened from
    if (view.kind === 'mine' && !view.from && page === 'mine/sauce') navigate('daily/recipes/mine', 'replace'); // Forward to a sauce page with nothing it was opened from
  }, [page, view]);
  // Opening a linked sauce is a page opened from a page: it pushes its own address, so Back returns to the recipe.
  const openLinked = (id: string, from: string) => { setViewNow({ kind: 'mine', id, from }); navigate('daily/recipes/mine/sauce', 'push'); };
  // Kept while another Daily section is open and until reload (lib/recipesViewState.ts): the source, search, tabs, filters and the recipe in the pane.
  const [src, setSrc] = useKept('src');
  const [q, setQ] = useKept('q');
  const [tab, setTab] = useKept('tab');
  const [recent, setRecent] = useKept('recent'); // the Recent pill: favourites and recently used recipes instead of a type tab
  const [filtersChoice, setFiltersChoice] = useSortChoice('recipes-filters', FILTER_CHOICES, 'closed'); // closed until opened; remembered on this device
  const filtersOpen = filtersChoice === 'open';
  const [selId, setSelId] = useKept('selId'); // the recipe in the detail pane (wide screens)
  const [paneChoice] = useSortChoice('recipes-detail', PANE_CHOICES, 'auto');
  const pane = useDetailPaneWidth() && paneChoice === 'auto';
  const libSignedOut = src === 'library' && !syncing; // the Library needs the account: a prompt replaces the search box, tabs and filters
  const [cat, setCat] = useKept('cat');
  const [canMake, setCanMake] = useKept('canMake');
  const [tagSel, setTagSel] = useKept('tagSel');
  const [nutSel, setNutSel] = useKept('nutSel');
  const [mineSort, setMineSort] = useSortChoice('recipes', RECIPE_SORTS, DEFAULT_RECIPE_SORT);
  const [libSort, setLibSort] = useSortChoice('recipes-library', LIBRARY_SORTS, DEFAULT_LIBRARY_SORT);
  const [lib, setLib] = useState<Library>({ status: 'loading' });
  const [libTab, setLibTab] = useKept('libTab');
  const [added, setAdded] = useState<{ id: string; name: string } | { error: string } | null>(null); // the last one-tap Add from the Library, for its Undo
  const [tries, setTries] = useState(0);
  const month = monthKey(new Date());
  const asked = useRef(''); // the search the library list shows; a page that arrives for an older one is dropped
  asked.current = `${q}|${cat}|${libSort}|${tries}`;
  const libCopy = useMemo(() => (view.kind === 'library' ? recipeFromCatalog(view.item, []) : null), [view]);

  const chips = visibleChips(chipCfg, src === 'mine');
  const tags = useMemo(() => tagCounts(recipes), [recipes]);
  const activeTags = useMemo(() => liveTags(recipes, tagSel), [recipes, tagSel]); // a renamed or deleted tag leaves the selection
  useEffect(() => { if (activeTags.length !== tagSel.length) setTagSel(activeTags); }, [activeTags, tagSel]); // drop a renamed or deleted tag so it cannot come back selected
  useEffect(() => { if (cat && !visibleChips(chipCfg, true).includes(cat)) setCat(null); }, [cat, chipCfg]); // a chip hidden while it is the filter: the filter clears
  const status = useMemo(() => new Map(recipes.map(r => [r.id, pantryStatus(r, grocery, months[month] ?? { lines: {}, pulled: [] }, recipes)])), [recipes, grocery, months, month]);
  const makeable = useMemo(() => new Set([...status].filter(([, s]) => s.total > 0 && s.have === s.total).map(([id]) => id)), [status]);
  const narrowed = useMemo(() => filterRecipes(recipes, { q, cat, canMake, tags: activeTags, nutrition: nutSel }, makeable), [recipes, q, cat, canMake, activeTags, nutSel, makeable]); // before the tab, so each tab's count is what it would show
  const counts = useMemo(() => tabCounts(narrowed), [narrowed]);
  const libShown = useMemo(() => (lib.status === 'ready' ? lib.items.filter(it => inLibraryTab(it, libTab)) : []), [lib, libTab]);
  const libHave = useMemo(() => new Map(libShown.map(it => [it.id, libraryHave(it, recipes, grocery, months[month] ?? { lines: {}, pulled: [] })])), [libShown, recipes, grocery, months, month]); // each row's "n of m at home", worked out once per change, not per render
  const picks = quickPicks(recipes, diet, openedThisVisit); // read every render: the opened list lives outside React
  const recentOn = recent && picks.length > 0; // the pill is hidden, and Recent off, when nothing was starred, logged or opened
  const shown = recentOn ? recentRows(narrowed, picks) : sortRecipes(tab === 'all' ? narrowed : narrowed.filter(r => inTab(r, tab)), mineSort, recipes, makeable);
  const selected = shown.find(r => r.id === selId) ?? shown[0]; // a deleted or filtered-out pick shows the list's first item

  useEffect(() => {
    if (src !== 'library' || !syncing) return;
    let live = true;
    const t = setTimeout(() => {
      setLib({ status: 'loading' });
      void searchRecipes(q, cat, 0, libSort, devHeaders).then(r => { if (live) setLib(r.ok ? { status: 'ready', items: r.items, more: r.more } : { status: 'failed', reason: r.reason }); });
    }, q ? 300 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [src, syncing, q, cat, libSort, tries]);
  const more = async () => {
    if (lib.status !== 'ready') return;
    const key = asked.current;
    const r = await searchRecipes(q, cat, lib.items.length, libSort, devHeaders);
    if (r.ok && key === asked.current) setLib({ status: 'ready', items: [...lib.items, ...r.items.filter(i => !lib.items.some(x => x.id === i.id))], more: r.more });
  };

  const back = () => setView({ kind: 'list' });
  const openRecipe = (id: string) => {
    if (pane) { // a pick in the pane is not recorded as opened: the Recent chips would appear or reorder under the pointer and move the list
      if (!shown.some(r => r.id === id)) { setTab('all'); setRecent(false); } // a pick the list hides shows it under All
      setSelId(id);
    } else { openedThisVisit.push(id); setView({ kind: 'mine', id }); }
  };
  const choose = (c: NewChoice) => {
    if (c === 'food') setView({ kind: 'form', ready: true });
    else if (c === 'scan') setView({ kind: 'form', ready: true, scan: true });
    else setView({ kind: 'form' }); // Recipe or meal: one form until meals-from-foods
  };
  const [typesUndo, setTypesUndo] = useState<(() => boolean) | null>(null); // Undo for the last "Looks right"; it belongs to this visit of the list
  const banner = untypedBanner(recipes);
  const backFromSauce = () => goUp('daily/recipes/mine'); // the address change shows the recipe it was opened from (effect above)
  const mineRecipe = view.kind === 'mine' ? recipes.find(r => r.id === view.id) : undefined;
  if (view.kind === 'form') {
    const editing = recipes.find(r => r.id === view.id), done = (id: string | null) => {
      if (pane) { if (id) showSavedRecipe(id); else if (editing) setSelId(editing.id); back(); return; } // beside the list: back to the list with the recipe open in the pane
      if (id) setView({ kind: 'mine', id }); else if (editing) setView({ kind: 'mine', id: editing.id }); else back(); // a phone: the recipe's page; Cancel from Edit returns to the recipe, from New to the list
    };
    return <section className="panel">{view.ready || editing?.cat === 'ready' ? <ReadyMadeForm recipe={editing} onDone={done} {...(view.scan ? { scanFirst: true } : {})} /> : <RecipeForm recipe={editing} start={view.start} onDone={done} />}</section>;
  }
  if (view.kind === 'types') return <FoodTypeReview onDone={undo => { setTypesUndo(() => undo); back(); }} onBack={back} />;
  if (view.kind === 'mine' && mineRecipe) return <RecipeDetail key={mineRecipe.id} recipe={mineRecipe} mine onBack={view.from && recipes.some(r => r.id === view.from) ? backFromSauce : back} onEdit={() => setView({ kind: 'form', id: mineRecipe.id })} onAdd={back} onOpen={id => openLinked(id, mineRecipe.id)} />;
  if (view.kind === 'library') {
    if (libCopy) return <RecipeDetail key={libCopy.id} recipe={libCopy} mine={false} onBack={back} onEdit={back} onAdd={servings => {
      useAppStore.getState().copyCatalogRecipe(view.item, servings); // an error here means it is already in Mine, which is where it opens
      const added = useAppStore.getState().recipes.find(r => r.from === view.item.id);
      if (added) { setSrc('mine'); setView({ kind: 'mine', id: added.id }); }
    }} />;
  }

  const addFromLibrary = (it: CatalogItem) => {
    const err = useAppStore.getState().copyCatalogRecipe(it);
    const copy = useAppStore.getState().recipes.find(r => r.from === it.id);
    setAdded(err ? { error: err } : copy ? { id: copy.id, name: it.name } : null);
  };

  // One compact row (brief recipes-list-compact): name and star, then the type and the macro line; the same right-hand slot holds Log or + Add, or an arrow that opens the item.
  const row = (o: { key: string; title: string; meta?: string; badge?: string | null; tag?: string | null; have?: string | null; haveAll?: boolean; edited?: boolean; fav?: boolean; current?: boolean; logId?: string; addIt?: () => void; mine?: boolean; open: () => void }) => (
    <li key={o.key} className={`rc-item${o.current ? ' current' : ''}`}>
      <button type="button" className="rc-row" onClick={o.open} aria-current={o.current ? 'true' : undefined}>
        <span className="rc-main">
          <span className="rc-title"><b id={`rc-t-${o.key}`}>{o.title}</b>{o.fav && <span className="rc-favmark" role="img" aria-label="Favorite"><Icon name="star-fill" /></span>}{o.mine && <span className="rc-inmine" role="img" aria-label="In Mine"><Icon name="check" /></span>}{o.edited && <span className="rc-edited">Edited</span>}</span>
          <span className="rc-meta">{o.tag && <span className="rc-typetag">{o.tag}</span>}{o.badge ? <span className="rc-badge">{o.badge}</span> : o.meta}{o.have && <span className={`rc-have${o.haveAll ? ' all' : ''}`}>{o.have}</span>}</span>
        </span>
        {!o.logId && !o.addIt && <span className="rc-go" aria-hidden="true"><Icon name="chevron-right" /></span>}
      </button>
      {o.logId && <button type="button" className="btn sm rc-log" aria-describedby={`rc-t-${o.key}`} onClick={() => useAppStore.getState().openModal({ type: 'portion', id: o.logId! })}>Log</button>}
      {o.addIt && <button type="button" className="btn sm rc-log rc-add" aria-label={`+ Add ${o.title}`} onClick={o.addIt}>+ Add</button>}
    </li>
  );

  return (
    <section className="panel" aria-labelledby="recipes-h">
      <div className="rc-titlebar">
        <h2 id="recipes-h" tabIndex={-1}>Recipes</h2>
        <div className="rc-src" role="group" aria-label="Recipe source">
          <button type="button" id="recipes-mine" className="pillbtn" aria-pressed={src === 'mine'} onClick={() => setSrc('mine')}>Mine</button>
          <button type="button" id="recipes-library" className="pillbtn" aria-pressed={src === 'library'} onClick={() => { setSrc('library'); setNutSel([]); setRecent(false); if (cat === 'ready') setCat(null); }}>Library</button>
        </div>
        {src === 'mine' && <RecipeNewMenu onChoose={choose} />}
      </div>
      {!libSignedOut && <div className="rc-top">
        <input type="search" aria-label="Search recipes" placeholder="Search by name or ingredient" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
        <button type="button" className="rc-filtertoggle" id="recipes-filters" aria-expanded={filtersOpen} aria-controls="recipes-filterbar" onClick={() => setFiltersChoice(filtersOpen ? 'closed' : 'open')}><Icon name="filter" /> Filters<Icon name={filtersOpen ? 'chevron-up' : 'chevron-down'} /></button>
      </div>}
      {src === 'mine' && <RecipeTypeTabs value={recentOn ? null : tab} counts={counts} onChange={t => { setRecent(false); setTab(t); }} {...(picks.length ? { recent: { on: recentOn, onToggle: () => setRecent(!recentOn) } } : {})} />}
      {src === 'library' && !libSignedOut && <RecipeTypeTabs value={libTab} onChange={t => setLibTab(t as LibraryTab)} tabs={LIBRARY_TABS} />}
      {!libSignedOut && <div className="rc-filterbar" id="recipes-filterbar" hidden={!filtersOpen}>
        <FilterSelect label="Category" value={cat ?? ''} onChange={v => setCat(v === '' ? null : v as RecipeCategory)}>
          <option value="">All categories</option>
          {chips.map(c => <option key={c} value={c}>{RECIPE_CATEGORY_LABEL[c]}</option>)}
        </FilterSelect>
        <div className="rc-chips">
          {src === 'mine' && <button type="button" aria-pressed={canMake} onClick={() => setCanMake(!canMake)}>Can make</button>}
          <button type="button" className="rc-manage" onClick={() => useAppStore.getState().openModal({ type: 'recipefilters' })}>Manage filters</button>
        </div>
        {src === 'mine' && tags.length > 0 && (
          <div className="rc-chips" role="group" aria-label="Tags">
            {tags.map(t => {
              const on = activeTags.some(a => a.toLowerCase() === t.tag.toLowerCase());
              return <button type="button" key={t.tag} aria-pressed={on} onClick={() => setTagSel(on ? activeTags.filter(a => a.toLowerCase() !== t.tag.toLowerCase()) : [...activeTags, t.tag])}>{t.tag}</button>;
            })}
          </div>
        )}
        {src === 'mine' && (
          <div className="rc-chips" role="group" aria-label="Nutrition">
            {NUTRITION_FILTERS.map(f => {
              const on = nutSel.includes(f.key);
              return <button type="button" key={f.key} aria-pressed={on} onClick={() => setNutSel(on ? nutSel.filter(k => k !== f.key) : [...nutSel, f.key])}>{f.label}</button>;
            })}
          </div>
        )}
        <div className="rc-sort">
          {src === 'mine' ? <SortControl options={RECIPE_SORTS} value={mineSort} onChange={setMineSort} /> : syncing && <SortControl options={LIBRARY_SORTS} value={libSort} onChange={setLibSort} />}
          {src === 'library' && syncing && <span className="rc-sortedby">{librarySortedBy(libSort, q)}</span>}
        </div>
      </div>}
      <RemovedNotice scope="recipes" />
      {typesUndo && (
        <Notice kind="undo" className="removednote" expire={{ ms: UNDO_MS, onExpire: () => setTypesUndo(null) }} actions={[{ label: 'Undo', onClick: () => { typesUndo(); setTypesUndo(null); } }, { label: 'Dismiss', onClick: () => setTypesUndo(null), ghost: true }]}>
          Food types saved.
        </Notice>
      )}
      {src === 'library' && added && ('error' in added ? (
        <p className="note gerr" role="alert">{added.error} <button type="button" className="btn sm" onClick={() => setAdded(null)}>Dismiss</button></p>
      ) : (
        <Notice kind="undo" className="removednote" expire={{ ms: UNDO_MS, onExpire: () => setAdded(null) }} actions={[{ label: 'Open', onClick: () => { setSrc('mine'); setView({ kind: 'mine', id: added.id }); setAdded(null); } }, { label: 'Undo', onClick: () => { useAppStore.getState().undoCatalogCopy(added.id); setAdded(null); } }, { label: 'Dismiss', onClick: () => setAdded(null), ghost: true }]}>
          {added.name} added to Mine.
        </Notice>
      ))}
      {src === 'mine' && banner && (
        <Notice kind="suggestion" actions={[{ label: 'Review types', onClick: () => setView({ kind: 'types' }) }]}>{banner}</Notice>
      )}

      {src === 'mine' && (
        <>
          {!recipes.length && (
            <EmptyTiles heading="Add your first recipe" tiles={[
              { id: 'rc-tile-new', label: 'Write a recipe', hint: 'Your own, ingredient by ingredient', onClick: () => setView({ kind: 'form' }) },
              { id: 'rc-tile-library', label: 'Browse the Library', hint: 'Copy a ready recipe into Mine', onClick: () => setSrc('library') },
            ]} />
          )}
          {recipes.length > 0 && !shown.length && <p className="note" id="recipes-empty">{recentOn ? 'Nothing recent matches. Clear the search or the filters.' : emptyTabNote(tab, !!q || !!cat || canMake || activeTags.length > 0 || nutSel.length > 0)}</p>}
          <div className={pane ? 'rc-split' : undefined}>
            <ul className={`rc-list rc-cards${pane ? ' rc-narrow' : ''}`}>
              {shown.map((r: Recipe) => {
                return row({ key: r.id, title: r.n, meta: recipeMeta(RECIPE_CATEGORY_LABEL[r.cat], r.cat === 'ready' ? undefined : r.servings, r.minutes), badge: nutritionBadge(r), tag: typeTag(r), edited: !!r.edited, fav: !!r.fav, current: pane && selected?.id === r.id, ...(loggableRecipe(r) ? { logId: r.id } : {}), open: () => openRecipe(r.id) });
              })}
            </ul>
            {pane && recipes.length > 0 && <RecipeDetailPane recipe={selected} onEdit={id => setView({ kind: 'form', id })} onGone={() => setSelId(null)} onOpen={setSelId} />}
          </div>
        </>
      )}

      {src === 'library' && (
        <>
          {libSignedOut && <LibrarySignIn />}
          {syncing && lib.status === 'loading' && <p className="note" role="status">Loading recipes…</p>}
          {syncing && lib.status === 'failed' && <p className="note gerr" role="alert">{lib.reason === 'offline' ? 'You’re offline. The library needs a connection.' : 'Couldn’t load the library.'} <button type="button" className="btn sm" onClick={() => setTries(tries + 1)}>Try again</button></p>}
          {syncing && lib.status === 'ready' && !lib.items.length && <p className="note">No library recipe matches.</p>}
          {syncing && lib.status === 'ready' && lib.items.length > 0 && !libShown.length && <p className="note">{libraryEmptyNote(libTab, lib.more)}</p>}
          {syncing && lib.status === 'ready' && (
            <>
              <ul className="rc-list rc-cards">
                {libShown.map(it => {
                  const have = libHave.get(it.id) ?? null, mine = inMine(it, recipes);
                  return row({ key: it.id, title: it.name, meta: recipeMeta(RECIPE_CATEGORY_LABEL[it.data.recipe!.cat], it.data.recipe!.servings, it.data.recipe!.minutes), have: have ? `${have.text} at home` : null, haveAll: !!have?.all, mine, ...(mine ? {} : { addIt: () => addFromLibrary(it) }), open: () => setView({ kind: 'library', item: it }) });
                })}
              </ul>
              {lib.more && <div className="rc-actions"><button type="button" className="btn" onClick={() => void more()}>Show more</button></div>}
              <p className="rc-attrib">Library recipes are from the Wikibooks Cookbook, CC BY-SA 4.0.</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
