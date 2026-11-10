import type { ReactNode } from 'react';
import Icon from './Icon.jsx';
import './FilterSelect.css';

// A filter as a compact dropdown that reads like a pill: a native picker, an accent pill with × once something is chosen. Value '' is All.
export default function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <span className={`fsel${value ? ' on' : ''}`}>
      <select aria-label={label} value={value} onChange={e => onChange(e.target.value)}>{children}</select>
      {value && <button type="button" className="fselx" aria-label={`Clear ${label} filter`} onClick={() => onChange('')}><Icon name="close" /></button>}
    </span>
  );
}
