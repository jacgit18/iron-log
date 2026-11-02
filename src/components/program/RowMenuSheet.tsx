import { useAppStore } from '../../store/useAppStore.js';
import { DAYS } from '../../lib/logic.js';
import { slotSummary } from '../../lib/programMove.js';
import ArmedButton from '../ArmedButton.jsx';
import Sheet from '../Sheet.jsx';
import '../sheets/MoveSheet.css';
import './RowMenuSheet.css';

// Program tab > ⋯ on a row: move the card up or down, to another day, to another program, or remove it. Every action closes the sheet; Remove needs a second press.
export default function RowMenuSheet({ idx }: { idx: number }) {
  const cfg = useAppStore(s => s.cfg);
  const edDay = useAppStore(s => s.edDay);
  const slots = useAppStore(s => s.edProgram().days[s.edDay - 1].slots);
  const slot = slots[idx];
  const st = useAppStore.getState();
  if (!slot) return null;
  const name = slotSummary(cfg, slot);
  const act = (f: () => void) => () => { st.closeModal(); f(); };
  return (
    <Sheet>
      <h2 className="cond">{name}</h2>
      <div className="rowmenu">
        <button type="button" className="btn rowmenu-item" aria-disabled={idx === 0} onClick={() => { if (idx > 0) act(() => st.moveEdSlot(idx, -1))(); }}>Move up</button>
        <button type="button" className="btn rowmenu-item" aria-disabled={idx === slots.length - 1} onClick={() => { if (idx < slots.length - 1) act(() => st.moveEdSlot(idx, 1))(); }}>Move down</button>
      </div>
      <div className="mvs-label" id="rm-day">Move to day</div>
      <div className="mvs-chips rowdays" role="group" aria-labelledby="rm-day">
        {DAYS.map(d => <button key={d} type="button" className={`btn mvs-chip mvs-day${d === edDay ? ' on' : ''}`} aria-pressed={d === edDay} aria-label={`Day ${d}`} onClick={() => { if (d === edDay) st.closeModal(); else act(() => st.moveEdSlotToDay(idx, d))(); }}>{d}</button>)}
      </div>
      <div className="rowmenu">
        <button type="button" className="btn rowmenu-item" onClick={() => st.openModal({ type: 'moveprog', idx })}>Move to another program…</button>
        <ArmedButton className="btn danger rowmenu-item" aria-label={`Remove ${name}`} label="Remove" armedLabel="Tap again to remove" onConfirm={act(() => st.removeEdSlot(idx))} />
      </div>
      <div className="actions">
        <button type="button" className="btn" onClick={st.closeModal}>Close</button>
      </div>
    </Sheet>
  );
}
