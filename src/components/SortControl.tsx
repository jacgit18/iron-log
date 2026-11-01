import { useId } from 'react';
import type { SortOption } from '../lib/sortChoice.js';
import './SortControl.css';

/** "Sort" and a native picker that reads as a pill. The visible word is the accessible name; the options read as plain words. */
export default function SortControl<K extends string>({ options, value, onChange }: { options: readonly SortOption<K>[]; value: K; onChange: (key: K) => void }) {
  const id = useId();
  return (
    <span className="sortctl">
      <label htmlFor={id} className="sortlab">Sort</label>
      <select id={id} value={value} onChange={e => onChange(e.target.value as K)}>
        {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </span>
  );
}
