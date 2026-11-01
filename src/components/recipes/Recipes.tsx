import { useEffect, useMemo, useRef, useState } from 'react';
import RemovedNotice from '../RemovedNotice.jsx';
import RecipeDetail from './RecipeDetail.js';
import ReadyMadeForm from './ReadyMadeForm.js';
import RecipeForm from './RecipeForm.js';
import './Recipes.css';
import { monthKey } from '../../lib/grocery.js';
import { recipeFromCatalog } from '../../lib/recipeDraft.js';
import { DEFAULT_LIBRARY_SORT, DEFAULT_RECIPE_SORT, LIBRARY_SORTS, RECIPE_SORTS, filterRecipes, librarySortedBy, recipeMeta, sortRecipes } from '../../lib/recipeList.js';
import { NUTRITION_FILTERS, nutritionBadge, type NutritionKey } from '../../lib/recipeNutrition.js';
import { pantryStatus } from '../../lib/recipePantry.js';
import { liveTags, tagCounts, visibleChips } from '../../lib/recipeTags.js';
import { RECIPE_CATEGORY_LABEL } from '../../shared/recipes.js';
import { pageOf } from '../../lib/route.js';
import { useAppStore } from '../../store/useAppStore.js';
import SortControl from '../SortControl.jsx';
import { useSortChoice } from '../useSortChoice.js';
import EmptyTiles from '../EmptyTiles.js';
import { goUp, navigate, useRoutePath } from '../useRoute.js';
import { signIn as devHeaders } from '../../sync/devUser.js';
import { searchRecipes } from '../../sync/recipeCatalog.js';
import type { CatalogItem, Recipe, RecipeCategory } from '../../types.ts';

// Recipes (ADR 084): yours (Mine, synced with the account) and the library (Wikibooks Cookbook, searched on the server). Each recipe's
// ingredients are checked against Groceries, At home. Its logic is in lib/recipeList.ts, lib/recipePantry.ts and the store's recipesSlice.
type View = { kind: 'list' } | { kind: 'mine'; id: string; from?: string } | { kind: 'library'; item: CatalogItem } | { kind: 'form'; id?: string; ready?: boolean };
type Library = { status: 'loading' } | { status: 'ready'; items: CatalogItem[]; more: boolean } | { status: 'failed'; reason: string };

export default function Recipes() {
  const recipes = useAppStore(s => s.recipes);
  const grocery = useAppStore(s => s.grocery);
  const months = useAppStore(s => s.groceryMonths);
  const syncing = useAppStore(s => s.sync !== null);
  const chipCfg = useAppStore(s => s.cfg.recipeChips);
  const [view, setViewNow] = useState<View>({ kind: 'list' });
  // A recipe page or the form adds a Back step (#/daily/recipes/mine); the recipe itself is not in the address, so a reload or pasted address shows the list.
  const page = pageOf(useRoutePath(), 'daily/recipes');
  const setView = (v: View) => {
    setViewNow(v);
    if (v.kind === 'list') goUp('daily/recipes'); else navigate(`daily/recipes/${v.kind}`, page ? 'replace' : 'push');
  };
  useEffect(() => {
    if (page && view.kind === 'list') navigate('daily/recipes', 'replace'); // an address for a page with nothing to show
    if (!page && view.kind !== 'list') setViewNow({ kind: 'list' }); // Back to the list
    if (view.kind === 'mine' && view.from && page === 'mine') setViewNow({ kind: 'mine', id: view.from }); // Back from a linked sauce to the recipe it was opened from
    if (view.kind === 'mine' && !view.from && page === 'mine/sauce') navigate('daily/recipes/mine', 'replace'); // Forward to a sauce page with nothing it was opened from
  }, [page, view]);
  // Opening a linked sauce is a page opened from a page: it pushes its own address, so Back returns to the recipe.
  const openLinked = (id: string, from: string) => { setViewNow({ kind: 'mine', id, from }); navigate('daily/recipes/mine/sauce', 'push'); };
  const [src, setSrc] = useState<'mine' | 'library'>('mine');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<RecipeCategory | null>(null);
  const [canMake, setCanMake] = useState(false);
  const [tagSel, setTagSel] = useState<string[]>([]);
  const [nutSel, setNutSel] = useState<NutritionKey[]>([]);
  const [mineSort, setMineSort] = useSortChoice('recipes', RECIPE_SORTS, DEFAULT_RECIPE_SORT);
  const [libSort, setLibSort] = useSortChoice('recipes-library', LIBRARY_SORTS, DEFAULT_LIBRARY_SORT);
  const [lib, setLib] = useState<Library>({ status: 'loading' });
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
  const shown = useMemo(() => sortRecipes(filterRecipes(recipes, { q, cat, canMake, tags: activeTags, nutrition: nutSel }, makeable), mineSort, recipes, makeable), [recipes, q, cat, canMake, activeTags, nutSel, makeable, mineSort]);

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
  const backFromSauce = () => goUp('daily/recipes/mine'); // the address change shows the recipe it was opened from (effect above)
  const mineRecipe = view.kind === 'mine' ? recipes.find(r => r.id === view.id) : undefined;
  if (view.kind === 'form') {
    const editing = recipes.find(r => r.id === view.id), done = (id: string | null) => { if (id) setView({ kind: 'mine', id }); else back(); };
    return <section className="panel">{view.ready || editing?.cat === 'ready' ? <ReadyMadeForm recipe={editing} onDone={done} /> : <RecipeForm recipe={editing} onDone={done} />}</section>;
  }
  if (view.kind === 'mine' && mineRecipe) return <RecipeDetail key={mineRecipe.id} recipe={mineRecipe} mine onBack={view.from && recipes.some(r => r.id === view.from) ? backFromSauce : back} onEdit={() => setView({ kind: 'form', id: mineRecipe.id })} onAdd={back} onOpen={id => openLinked(id, mineRecipe.id)} />;
  if (view.kind === 'library') {
    if (libCopy) return <RecipeDetail key={libCopy.id} recipe={libCopy} mine={false} onBack={back} onEdit={back} onAdd={servings => {
      useAppStore.getState().copyCatalogRecipe(view.item, servings); // an error here means it is already in Mine, which is where it opens
      const added = useAppStore.getState().recipes.find(r => r.from === view.item.id);
      if (added) { setSrc('mine'); setView({ kind: 'mine', id: added.id }); }
    }} />;
  }

  const row = (key: string, title: string, meta: string, pill: string, tail: string | null, tailAll: boolean, open: () => void, edited = false, badge: string | null = null) => (
    <li key={key}>
      <button type="button" className="rc-row" onClick={open}>
        <span><b>{title}</b><span className="pill custom">{pill}</span>{edited && <span className="rc-edited">Edited</span>}<span className="rc-meta">{meta}</span>{badge && <span className="rc-badge">{badge}</span>}</span>
        {tail && <span className={`rc-have${tailAll ? ' all' : ''}`}>{tail}</span>}
      </button>
    </li>
  );

  return (
    <section className="panel" aria-labelledby="recipes-h">
      <h2 id="recipes-h" tabIndex={-1}>Recipes</h2>
      <div className="seg" role="group" aria-label="Recipe source">
        <button type="button" id="recipes-mine" className={src === 'mine' ? 'on' : ''} aria-pressed={src === 'mine'} onClick={() => setSrc('mine')}>Mine</button>
        <button type="button" id="recipes-library" className={src === 'library' ? 'on' : ''} aria-pressed={src === 'library'} onClick={() => { setSrc('library'); setNutSel([]); if (cat === 'ready') setCat(null); }}>Library</button>
      </div>
      <div className="rc-top">
        <input type="search" aria-label="Search recipes" placeholder="Search by name or ingredient" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
        {src === 'mine' && <button type="button" className="btn" onClick={() => setView({ kind: 'form' })}>New recipe</button>}
        {src === 'mine' && <button type="button" className="btn" onClick={() => setView({ kind: 'form', ready: true })}>New ready-made food</button>}
      </div>
      <div className="rc-chips" role="group" aria-label="Category">
        <button type="button" aria-pressed={cat === null} onClick={() => setCat(null)}>All</button>
        {chips.map(c => <button type="button" key={c} aria-pressed={cat === c} onClick={() => setCat(cat === c ? null : c)}>{RECIPE_CATEGORY_LABEL[c]}</button>)}
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
      <RemovedNotice scope="recipes" />

      {src === 'mine' && (
        <>
          {!recipes.length && (
            <EmptyTiles heading="Add your first recipe" tiles={[
              { id: 'rc-tile-new', label: 'Write a recipe', hint: 'Your own, ingredient by ingredient', onClick: () => setView({ kind: 'form' }) },
              { id: 'rc-tile-library', label: 'Browse the Library', hint: 'Copy a ready recipe into Mine', onClick: () => setSrc('library') },
              { id: 'rc-tile-ready', label: 'Add a ready-made food', hint: 'A packaged food with its nutrition', onClick: () => setView({ kind: 'form', ready: true }) },
            ]} />
          )}
          {recipes.length > 0 && !shown.length && <p className="note">No recipe matches. Clear the search or the filters.</p>}
          <ul className="rc-list">
            {shown.map((r: Recipe) => {
              const s = status.get(r.id)!;
              return row(r.id, r.n, recipeMeta(RECIPE_CATEGORY_LABEL[r.cat], r.servings, r.minutes), r.from ? 'Library' : 'Custom', s.total ? `${s.have} of ${s.total}` : null, s.total > 0 && s.have === s.total, () => setView({ kind: 'mine', id: r.id }), !!r.edited, nutritionBadge(r));
            })}
          </ul>
        </>
      )}

      {src === 'library' && (
        <>
          {!syncing && <p className="note">Sign in to browse the recipe library.</p>}
          {syncing && lib.status === 'loading' && <p className="note" role="status">Loading recipes…</p>}
          {syncing && lib.status === 'failed' && <p className="note gerr" role="alert">{lib.reason === 'offline' ? 'You’re offline. The library needs a connection.' : 'Couldn’t load the library.'} <button type="button" className="btn sm" onClick={() => setTries(tries + 1)}>Try again</button></p>}
          {syncing && lib.status === 'ready' && !lib.items.length && <p className="note">No library recipe matches.</p>}
          {syncing && lib.status === 'ready' && (
            <>
              <ul className="rc-list">
                {lib.items.map(it => row(it.id, it.name, recipeMeta(RECIPE_CATEGORY_LABEL[it.data.recipe!.cat], it.data.recipe!.servings, it.data.recipe!.minutes), recipes.some(r => r.from === it.id) ? 'In Mine' : 'Library', null, false, () => setView({ kind: 'library', item: it })))}
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
