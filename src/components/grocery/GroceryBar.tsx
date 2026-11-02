import type { SortOption } from '../../lib/sortChoice.js';
import SortControl from '../SortControl.jsx';

/** The search box and the Sort pill above a grocery list. Escape (or the browser's own clear button) empties the search. */
export default function GroceryBar<K extends string>({ q, onQ, options, sort, onSort }: { q: string; onQ: (q: string) => void; options: readonly SortOption<K>[]; sort: K; onSort: (key: K) => void }) {
  return (
    <div className="gbar" role="search">
      <input type="search" className="gsearch" aria-label="Search groceries" placeholder="Search groceries" autoComplete="off" value={q}
        onChange={e => onQ(e.target.value)} onKeyDown={e => { if (e.key === 'Escape' && q) { e.preventDefault(); onQ(''); } }} />
      <SortControl options={options} value={sort} onChange={onSort} />
    </div>
  );
}

/** The note shown when the search matches nothing. */
export const NoMatch = ({ q }: { q: string }) => <p className="note" id="groc-nomatch" role="status">{`No items match “${q.trim()}”.`}</p>;
