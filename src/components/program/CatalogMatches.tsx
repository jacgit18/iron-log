import { useState } from 'react';
import type { CatalogItem, CatalogKind } from '../../types.ts';
import { pickerOptions, type MineOption } from '../../lib/picker.js';
import { useCatalogSearch, MIN_LETTERS } from '../../hooks/useCatalogSearch.js';

/* A library's search, part two (ADR 036, spec step 5): catalog items matching the words typed that you do not have yet, each with Add.
   Replaces the Browse catalog sheets. Shown only when syncing (local mode has no catalog, ADR 025) and something is typed. What Add
   copies is yours from then on (ADR 026), so the row leaves this list and shows above as one of yours. */
type Props = {
  kind: CatalogKind;
  q: string;
  /** Every item in the library, so catalog items you already have (by catalog id or name) are left out. */
  mine: MineOption[];
  meta: (c: CatalogItem) => string;
  /** Adds one to the library; returns an error message, or null. */
  onAdd: (c: CatalogItem) => string | null;
  /** The library's other filters, applied to catalog items too (exercises: equipment and muscle, keepCatalogItems). */
  narrow?: (items: CatalogItem[]) => CatalogItem[];
  unit: string;
  source: string;
};

const MAX = 20;

export default function CatalogMatches({ kind, q, mine, meta, onAdd, narrow, unit, source }: Props) {
  const typed = q.trim() !== '';
  const { state, retry } = useCatalogSearch(kind, q, typed);
  const [errs, setErrs] = useState<Record<string, string>>({});
  if (state.status === 'off' || !typed) return null;
  const byBrand = kind === 'supplement';
  const ready = state.status === 'ready' ? (narrow ? narrow(state.items) : state.items) : [];
  // An earlier search's answer, kept while the next runs, is filtered here so it never sits under unrelated words.
  const o = pickerOptions(q, mine, ready, { byBrand, serverFiltered: byBrand && !(state.status === 'ready' && state.searching), max: MAX });
  const rows = o.catalog.shown;
  const note = state.status === 'short' ? `Type at least ${MIN_LETTERS} letters to search the catalog.`
    : state.status === 'loading' || (state.status === 'ready' && state.searching) ? 'Searching the catalog…'
    : state.status === 'failed' ? (state.reason === 'offline' ? 'The catalog needs a connection.' : state.reason === 'refused' ? 'The catalog is not available to this account.' : 'The catalog could not be loaded.')
    : !rows.length ? `No ${unit} in the catalog match that, or you have them all.`
    : null;
  // The store call stays outside the state updater: React may run an updater twice, which would add and then refuse a duplicate.
  const add = (c: CatalogItem) => { const m = onAdd(c) || ''; setErrs(e => ({ ...e, [c.id]: m })); };
  const more = o.catalog.hidden || (state.status === 'ready' && state.more);
  return (
    <section className="catmatch" aria-labelledby={`catmatch-${kind}`}>
      <div className="sect" id={`catmatch-${kind}`}>From the catalog</div>
      {note && (
        <div className="picknote">
          <span className={`note${state.status === 'failed' ? ' err' : ''}`} role="status">{note}</span>
          {state.status === 'failed' && state.reason !== 'refused' && <button type="button" className="btn sm ghost" onClick={retry}>Try again</button>}
        </div>
      )}
      {rows.length > 0 && (
        <div className="exrows">
          {rows.map(c => (
            <div className="exrow" key={c.id}>
              <div className="exmain">
                <b>{c.name}</b>
                {meta(c) && <span className="note">{meta(c)}</span>}
                {errs[c.id] && <span className="note err" role="alert">{errs[c.id]}</span>}
              </div>
              <button type="button" className="btn sm" aria-label={`Add ${c.name}${c.brand ? ` by ${c.brand}` : ''} from the catalog`} onClick={() => add(c)}>Add</button>
            </div>
          ))}
        </div>
      )}
      {more ? <p className="note">More match in the catalog. Keep typing to narrow it down.</p> : null}
      <p className="note">{source}</p>
    </section>
  );
}
