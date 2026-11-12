import { isEaten } from '../../../lib/dietPlan.js';
import { macroLine } from '../../../lib/macroLine.js';
import { PLAN_SLOTS } from '../../../shared/diet.js';
import { SLOT_LABEL, type BoardItem } from '../../../lib/weekBoard.js';
import type { PlanSlot } from '../../../types.ts';
import { useAppStore } from '../../../store/useAppStore.js';
import ArmedButton from '../../ArmedButton.jsx';

// One planned item on the board: its name, calories and protein; today it has a check box that logs it as eaten (and unchecking removes what it logged); tapping the card opens Less, More, Move to (a day or a meal) and Remove.
// A listed daily snack that is only shown on this day (`item.virtual`, brief daily-snacks) is stored as a real item of the day first when it is ticked, changed or moved; its Remove skips it for this day only; it is not dragged.
export default function BoardCard({ item, day, today, days, open, moving, onOpen, onMoveOpen, onLog, onMsg }: {
  item: BoardItem; day: string; today: string; days: { id: string; label: string }[]; open: boolean; moving: boolean;
  onOpen: () => void; onMoveOpen: () => void; onLog: (r: BoardItem['r'], index: number) => void; onMsg: (t: string) => void;
}) {
  const { r, index } = item;
  const st = () => useAppStore.getState();
  const eaten = useAppStore(s => isEaten(r.item, s.diet));
  const checkable = day === today && !r.gone;
  const name = r.item.k === 'm' ? `${r.name} (meal)` : r.name;
  // The item's place in the stored plan: a shown daily snack is stored now (never refused for a full day: snacks do not count toward the 8).
  const real = (): number => {
    if (!item.virtual) return index;
    const at = st().realizeDailySnack(day, r.item.id);
    if (typeof at === 'string') { onMsg(at); return -1; }
    return at;
  };
  const move = (toDay: string, slot: PlanSlot | undefined) => { const at = real(); if (at < 0) return; onMsg(st().movePlanItem(day, at, toDay, slot) ?? ''); onOpen(); };
  const portion = (to: number) => { const at = real(); if (at >= 0) st().setPlanPortion(day, at, to); };
  const tick = () => {
    if (eaten) { st().uncheckPlanItem(day, index); return; }
    const at = real();
    if (at < 0) return;
    onLog(r, at);
    if (item.virtual) st().unstoreDailySnack(day, at); // a log that failed leaves nothing stored: the snack is only shown again
  };
  return (
    <div className={`wb-cardwrap${eaten ? ' eaten' : ''}`}>
      <div className="nb-cardrow">
      {checkable && <button type="button" role="checkbox" aria-checked={eaten} className="nb-eatck" aria-label={`${eaten ? 'Uncheck' : 'Check'} ${r.name} as eaten`} onClick={tick}><i aria-hidden="true">✓</i></button>}
      <button type="button" className={`wb-card${open ? ' open' : ''}`} draggable={!item.virtual} aria-expanded={open} data-from={`${day}:${index}`} onClick={onOpen}
        onDragStart={e => { e.dataTransfer.setData('text/plain', JSON.stringify({ day, index })); e.dataTransfer.effectAllowed = 'move'; }}>
        <span className="wb-ct">{name}{r.portion !== 1 ? ` × ${r.portion}` : ''}</span>
        <span className="wb-cm">{r.gone ? 'Removed' : macroLine({ ...(r.kcal !== undefined ? { kcal: r.kcal } : {}), ...(r.p !== undefined ? { p: r.p } : {}) }) || 'Needs numbers'}</span>
      </button>
      </div>
      {open && (
        <div className="wb-acts">
          {r.item.k === 'r' && !r.gone && <button type="button" className="btn sm" aria-label={`Less ${r.name}`} disabled={r.portion <= 0.5} onClick={() => portion(r.portion - 0.5)}>Less</button>}
          {r.item.k === 'r' && !r.gone && <button type="button" className="btn sm" aria-label={`More ${r.name}`} disabled={r.portion >= 10} onClick={() => portion(r.portion + 0.5)}>More</button>}
          <button type="button" className="btn sm" aria-label={`Move ${r.name}`} aria-expanded={moving} onClick={onMoveOpen}>Move to…</button>
          {item.virtual
            ? <ArmedButton className="btn sm" aria-label={`Skip ${r.name} today`} label="Skip today" armedLabel="Tap again to skip" onConfirm={() => { st().skipDailySnack(day, r.item.id); onOpen(); }} />
            : <ArmedButton className="btn sm" aria-label={`Remove ${r.name}`} label="Remove" armedLabel="Tap again to remove" onConfirm={() => { st().removePlanItem(day, index); onOpen(); }} />}
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
