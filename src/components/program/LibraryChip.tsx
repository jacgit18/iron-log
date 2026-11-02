import type { ReactNode } from 'react';
import Icon from '../Icon.jsx';

// A library filter as a chip: a native picker that reads like a pill, an accent pill with × once something is chosen.
export default function LibraryChip({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <span className={`libchip${value ? ' on' : ''}`}>
      <select aria-label={label} value={value} onChange={e => onChange(e.target.value)}>{children}</select>
      {value && <button type="button" className="libchipx" aria-label={`Clear ${label} filter`} onClick={() => onChange('')}><Icon name="close" /></button>}
    </span>
  );
}
