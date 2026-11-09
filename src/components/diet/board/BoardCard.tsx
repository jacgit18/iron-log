import { fmtNum } from '../../../lib/dietLog.js';
import { PLAN_SLOTS } from '../../../shared/diet.js';
import { SLOT_LABEL, type BoardItem } from '../../../lib/weekBoard.js';
import type { PlanSlot } from '../../../types.ts';
import { useAppStore } from '../../../store/useAppStore.js';

// One planned item on the board: its name, calories and protein; tapping opens Less, More, Move to (a day or a meal), Log (today) and Remove.
export default function BoardCard({ item, day, today, days, open, moving, onOpen, onMoveOpen, onLog, onMsg }: {
  item: BoardItem; day: string; today: string; days: { id: string; label: string }[]; open: boolean; moving: boolean;
  onOpen: () => void; onMoveOpen: () => void; onLog: (r: BoardItem['r']) => void; onMsg: (t: string) => void;
}) {
  const { r, index } = item;
  const st = () => useAppStore.getState();
  const name = r.item.k === 'm' ? `${r.name} (meal)` : r.name;
  const move = (toDay: string, slot: PlanSlot | undefined) => { onMsg(st().movePlanItem(day, index, toDay, slot) ?? ''); onOpen(); };
  return (
    <div className="wb-cardwrap">
      <button type="button" className={`wb-card${open ? ' open' : ''}`} draggable aria-expanded={open} data-from={`${day}:${index}`} onClick={onOpen}
        onDragStart={e => { e.dataTransfer.setData('text/plain', JSON.stringify({ day, index })); e.dataTransfer.effectAllowed = 'move'; }}>
        <span className="wb-ct">{name}{r.portion !== 1 ? ` × ${r.portion}` : ''}</span>
        <span className="wb-cm">{r.gone ? 'Removed' : r.kcal !== undefined ? `${fmtNum(r.kcal)} kcal${r.p !== undefined ? ` · ${fmtNum(r.p)} g protein` : ''}` : 'No calories'}</span>
      </button>
      {open && (
        <div className="wb-acts">
          {r.item.k === 'r' && !r.gone && <button type="button" className="btn sm" aria-label={`Less ${r.name}`} disabled={r.portion <= 0.5} onClick={() => st().setPlanPortion(day, index, r.portion - 0.5)}>Less</button>}
          {r.item.k === 'r' && !r.gone && <button type="button" className="btn sm" aria-label={`More ${r.name}`} disabled={r.portion >= 10} onClick={() => st().setPlanPortion(day, index, r.portion + 0.5)}>More</button>}
          <button type="button" className="btn sm" aria-label={`Move ${r.name}`} aria-expanded={moving} onClick={onMoveOpen}>Move to…</button>
          {day === today && !r.gone && <button type="button" className="btn sm primary" aria-label={`Log ${r.name}`} onClick={() => onLog(r)}>Log</button>}
          <button type="button" className="btn sm" aria-label={`Remove ${r.name}`} onClick={() => { st().removePlanItem(day, index); onOpen(); }}>Remove</button>
        </div>
      )}
      {open && moving && (
        <div className="wb-move" role="group" aria-label={`Move ${r.name} to`}>
          <span className="wb-movegrp">Day</span>
          {days.filter(d => d.id !== day).map(d => <button type="button" key={d.id} className="btn sm" onClick={() => move(d.id, r.item.s)}>{d.label}</button>)}
          <span className="wb-movegrp">Meal</span>
          {PLAN_SLOTS.filter(s => s !== r.item.s).map(s => <button type="button" key={s} className="btn sm" onClick={() => move(day, s)}>{SLOT_LABEL[s]}</button>)}
        </div>
      )}
    </div>
  );
}
