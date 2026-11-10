import { useId, type ReactNode } from 'react';
import type { SortOption } from '../../lib/sortChoice.js';
import './GroceryPhoneBar.css';

// Shopping's search and buttons on a phone (brief groceries-spending-buttons-quick-add, option 1): a full-width search box, then one row of equal buttons, Sort, Select items and More.
// Sort is a native picker laid under its own word, so the button says "Sort" and the phone's picker opens on a tap. The row has the buttons it has: Select items shows only with sharing.
export default function GroceryPhoneBar<K extends string>({ q, onQ, options, sort, onSort, searchOn, select, more }: { q: string; onQ: (q: string) => void; options: readonly SortOption<K>[]; sort: K; onSort: (key: K) => void; searchOn: boolean; select: ReactNode; more: ReactNode }) {
  const id = useId();
  return (
    <div className="gphone">
      {searchOn && (
        <div className="gphonesearch" role="search">
          <input type="search" className="gsearch" aria-label="Search groceries" placeholder="Search groceries" autoComplete="off" value={q}
            onChange={e => onQ(e.target.value)} onKeyDown={e => { if (e.key === 'Escape' && q) { e.preventDefault(); onQ(''); } }} />
        </div>
      )}
      <div className="gphonebtns">
        {searchOn && (
          <span className="btn gsortbtn">
            <span aria-hidden="true">Sort</span>
            <select id={id} aria-label="Sort" value={sort} onChange={e => onSort(e.target.value as K)}>
              {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </span>
        )}
        {select}
        {more}
      </div>
    </div>
  );
}
