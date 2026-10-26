import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { defaultDestination, movePreview, moveTargets, programByKey, slotSummary } from '../../lib/programMove.js';
import Sheet from '../Sheet.jsx';
import './MoveSheet.css';

// Program tab > Move…: pick another program (or this one) and a day, read where the card will land, then Move. Cancel changes nothing.
export default function MoveSheet({ idx }: { idx: number }) {
  const cfg = useAppStore(s => s.cfg);
  const library = useAppStore(s => s.library);
  const programs = useAppStore(s => s.programs);
  const fromKey = useAppStore(s => s.edKey());
  const fromDay = useAppStore(s => s.edDay);
  const slot = useAppStore(s => s.edProgram().days[s.edDay - 1].slots[idx]);
  const [dest, setDest] = useState(() => defaultDestination(fromKey, fromDay));
  const st = useAppStore.getState();
  const targets = moveTargets(cfg, library);
  const to = targets.find(t => t.key === dest.key);
  if (!slot || !to) return null;
  const target = programByKey(programs, library, to.key);
  const preview = movePreview({ slot, fromKey, fromDay, to, toDay: dest.day, targetSlots: target ? target.days[dest.day - 1].slots : [] });
  const name = slotSummary(cfg, slot);
  const go = () => { st.closeModal(); st.moveEdSlotToProgram(idx, dest.key, dest.day); };
  return (
    <Sheet>
      <h2 className="cond">Move {name}</h2>
      <div className="mvs-label" id="mvs-prog">Program</div>
      <div className="mvs-chips" role="group" aria-labelledby="mvs-prog">
        {targets.map(t => <button key={t.key} type="button" className={`btn mvs-chip${t.key === dest.key ? ' on' : ''}`} aria-pressed={t.key === dest.key} onClick={() => setDest({ ...dest, key: t.key })}>{t.label}</button>)}
      </div>
      <div className="mvs-label" id="mvs-day">Day</div>
      <div className="mvs-chips" role="group" aria-labelledby="mvs-day">
        {[1, 2, 3, 4, 5, 6, 7].map(d => <button key={d} type="button" className={`btn mvs-chip mvs-day${d === dest.day ? ' on' : ''}`} aria-pressed={d === dest.day} aria-label={`Day ${d}`} onClick={() => setDest({ ...dest, day: d })}>{d}</button>)}
      </div>
      <div className="notice mvs-prev" role="status">
        <b>{preview.line}</b>
        {preview.notes.map(n => <span key={n}>{n}</span>)}
      </div>
      <div className="actions">
        <button type="button" className="btn primary" disabled={preview.same} onClick={go}>Move</button>
        <button type="button" className="btn primary" onClick={go}>Move</button>
      </div>
    </Sheet>
  );
}
