import { useAppStore } from '../../store/useAppStore.js';
import { eqOptions } from '../../lib/equipment.js';
import { MUSCLES, M_KEYS } from '../../lib/muscles.js';
import Sheet from '../Sheet.jsx';
import { useBoardFilter } from './useBoardFilter.js';

// Phone only: the Board's sort by muscle and equipment pickers. A change applies at once; Show cards closes the sheet.
export default function BoardFilterSheet() {
  const cfg = useAppStore(s => s.cfg);
  const muscle = useBoardFilter(s => s.muscle);
  const eq = useBoardFilter(s => s.eq);
  const { set, clear } = useBoardFilter.getState();
  return (
    <Sheet>
      <h2 className="cond">Sort &amp; filter</h2>
      <label className="field">Sort by muscle
        <select value={muscle} onChange={e => set({ muscle: e.target.value })}>
          <option value="">Program order</option>
          {M_KEYS.map(k => <option key={k} value={k}>{MUSCLES[k].n}</option>)}
        </select>
      </label>
      <label className="field">Equipment
        <select value={eq} onChange={e => set({ eq: e.target.value })}>
          <option value="">All equipment</option>
          {eqOptions(cfg).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>
      <div className="actions">
        <button type="button" className="btn" disabled={!muscle && !eq} onClick={clear}>Clear</button>
        <button type="button" className="btn primary" onClick={useAppStore.getState().closeModal}>Show cards</button>
      </div>
    </Sheet>
  );
}
