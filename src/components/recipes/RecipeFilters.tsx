import { useState } from 'react';
import { chipOrder, moveChip, tagCounts, toggleChip } from '../../lib/recipeTags.js';
import { MAX_TAG, RECIPE_CATEGORY_LABEL } from '../../shared/recipes.js';
import { useAppStore } from '../../store/useAppStore.js';
import Sheet from '../Sheet.jsx';
import './RecipeFilters.css';

// Manage filters (brief recipe-filter-editing): hide and reorder the built-in category chips, and rename or delete your own tags.
// A sheet, not a screen: it adds one history entry, so Back closes it. The category list is fixed (the Library and other features use it).
export default function RecipeFilters() {
  const chips = useAppStore(s => s.cfg.recipeChips);
  const recipes = useAppStore(s => s.recipes);
  const [editing, setEditing] = useState<string | null>(null); // the tag being renamed
  const [name, setName] = useState('');
  const [asking, setAsking] = useState<string | null>(null); // the tag whose delete is waiting for a yes
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const st = useAppStore.getState();
  const toDone = () => setTimeout(() => document.getElementById('rcf-done')?.focus(), 0); // the row that held focus is replaced: focus moves to Done, not to the page
  const order = chipOrder(chips), hidden = chips?.hide ?? [], counts = tagCounts(recipes);

  const rename = () => {
    if (editing === null) return;
    const e = st.renameTag(editing, name);
    if (e) { setErr(e); return; }
    setNote(`Renamed to ${name.trim()}.`); setEditing(null); setErr(''); toDone();
  };
  const remove = (tag: string) => {
    const n = st.removeTag(tag);
    setNote(`Removed ${tag} from ${n} recipe${n === 1 ? '' : 's'}.`); setAsking(null); toDone();
  };

  return (
    <Sheet className="rcf">
      <h2 className="cond">Manage filters</h2>
      <h3>Categories</h3>
      <p className="note">Hide a chip or move it. Recipes in a hidden category still show under All.</p>
      <ul className="rcf-list">
        {order.map((c, i) => {
          const off = hidden.includes(c), label = RECIPE_CATEGORY_LABEL[c];
          return (
            <li key={c} className={off ? 'off' : ''}>
              <span className="rcf-name">{label}{off && <span className="rcf-state"> (hidden)</span>}</span>
              <button type="button" className="btn sm" aria-label={`Move up ${label}`} disabled={i === 0} onClick={() => st.setRecipeChips(moveChip(chips, c, -1))}>Move up</button>
              <button type="button" className="btn sm" aria-label={`Move down ${label}`} disabled={i === order.length - 1} onClick={() => st.setRecipeChips(moveChip(chips, c, 1))}>Move down</button>
              <button type="button" className="btn sm" aria-label={`${off ? 'Show' : 'Hide'} ${label}`} aria-pressed={off} onClick={() => st.setRecipeChips(toggleChip(chips, c))}>{off ? 'Show' : 'Hide'}</button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn sm" disabled={!chips} onClick={() => st.setRecipeChips(undefined)}>Show all</button>

      <h3>Tags</h3>
      {!counts.length && <p className="note">Tags you add to a recipe appear here.</p>}
      <ul className="rcf-list">
        {counts.map(({ tag, n }) => (
          <li key={tag}>
            {editing === tag ? (
              <form className="rcf-edit" onSubmit={e => { e.preventDefault(); rename(); }}>
                <label>New name for {tag}<input value={name} maxLength={MAX_TAG} onChange={e => { setName(e.target.value); setErr(''); }} autoComplete="off" autoFocus /></label>
                <button type="submit" className="btn sm primary">Save name</button>
                <button type="button" className="btn sm" onClick={() => { setEditing(null); setErr(''); toDone(); }}>Cancel rename</button>
              </form>
            ) : asking === tag ? (
              <div className="rcf-ask" role="group" aria-label={`Delete tag ${tag}`}>
                <p>Remove “{tag}” from {n} recipe{n === 1 ? '' : 's'}? The recipes stay.</p>
                <button type="button" className="btn sm danger" onClick={() => remove(tag)}>Remove tag</button>
                <button type="button" className="btn sm" onClick={() => { setAsking(null); toDone(); }} autoFocus>Keep tag</button>
              </div>
            ) : (
              <>
                <span className="rcf-name">{tag}<span className="rcf-state"> · {n} recipe{n === 1 ? '' : 's'}</span></span>
                <button type="button" className="btn sm" aria-label={`Rename ${tag}`} onClick={() => { setEditing(tag); setName(tag); setAsking(null); setErr(''); setNote(''); }}>Rename</button>
                <button type="button" className="btn sm" aria-label={`Delete tag ${tag}`} onClick={() => { setAsking(tag); setEditing(null); setNote(''); }}>Delete tag</button>
              </>
            )}
          </li>
        ))}
      </ul>
      {err && <p className="note gerr" role="alert">{err}</p>}
      <p className="note" role="status">{note}</p>
      <div className="actions">
        <button type="button" id="rcf-done" className="btn primary" onClick={st.closeModal}>Done</button>
      </div>
    </Sheet>
  );
}
