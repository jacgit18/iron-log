import FilterSelect from '../FilterSelect.jsx';
import { IDEA_STATUS, type IdeaStatus } from '../../lib/experimentFilter.js';
import './IdeaFilters.css';

// The filter row above a long Ideas to try list: search, Status and Muscle dropdowns, Clear and the count.
type Props = {
  q: string; onQ: (v: string) => void; status: IdeaStatus; onStatus: (v: IdeaStatus) => void; muscle: string; onMuscle: (v: string) => void;
  muscles: { key: string; label: string }[]; shown: number; total: number;
};

export default function IdeaFilters({ q, onQ, status, onStatus, muscle, onMuscle, muscles, shown, total }: Props) {
  const filtering = q.trim() !== '' || status !== '' || muscle !== '';
  return (
    <div className="ideafilters" role="search">
      <div className="ifsearch">
        <label className="field" htmlFor="exp-q">Search<input id="exp-q" type="search" value={q} placeholder="Name or note" onChange={e => onQ(e.target.value)} /></label>
        <span className="note ifcount" role="status">{filtering ? `${shown} of ${total} ideas` : `${total} ideas`}</span>
      </div>
      <div className="ifpills">
        <FilterSelect label="Status" value={status} onChange={v => onStatus(v as IdeaStatus)}>
          <option value="">Status: All</option>
          {IDEA_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </FilterSelect>
        <FilterSelect label="Muscle" value={muscle} onChange={onMuscle}>
          <option value="">Muscle: All</option>
          {muscles.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </FilterSelect>
        {filtering && <button type="button" className="btn sm ghost ifclear" aria-label="Clear the search and filters" onClick={() => { onQ(''); onStatus(''); onMuscle(''); }}>Clear</button>}
      </div>
    </div>
  );
}
