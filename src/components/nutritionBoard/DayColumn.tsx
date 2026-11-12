import { foodEditable, shortDay, type DayView } from '../../lib/nutritionBoard.js';
import type { Resolved } from '../../lib/dietPlan.js';
import type { PlanSlot } from '../../types.ts';
import DayMeters from './DayMeters.js';
import HydrationSection from './HydrationSection.js';
import MealSections from './MealSections.js';
import NotInMeal from './EatenRows.js';
import SupplementsSection from './SupplementsSection.js';

// One day of the board: its name (tap to pick it as the day the toolbar adds to), meters, its meals with the food eaten in them, a "Not in a meal" group for food with no meal, Supplements and Hydration.
// Last week has no meals (the plan holds no past days): its food is one "Not in a meal" group; food can be added to it (brief nutrition-any-day-add), so its rows open the row sheet to edit or delete like today's.
export default function DayColumn({ v, today, selected, days, onPick, onLog, onMsg, onAdd }: { v: DayView; today: string; selected: boolean; days: { id: string; label: string }[]; onPick: () => void; onLog: (r: Resolved, index: number) => void; onMsg: (t: string) => void; onAdd: (meal: PlanSlot) => void }) {
  const editable = foodEditable(v.day, today);
  return (
    <div className={`wb-col nb-col${v.day === today ? ' today' : ''}${v.kind === 'past' ? ' past' : ''}${selected ? ' sel' : ''}`} data-day={v.day}>
      <div className="wb-colhd">
        <button type="button" className="nb-dayname" aria-pressed={selected} aria-label={`${shortDay(v.day)}${v.day === today ? ' · today' : ''}, add food here`} onClick={onPick}><b>{shortDay(v.day)}{v.day === today ? ' · today' : ''}</b></button>
      </div>
      <DayMeters v={v} />
      {v.kind !== 'past' && <MealSections view={v.plan} placed={v.placed.meals} today={today} days={days} editable={editable} onLog={onLog} onMsg={onMsg} onAdd={onAdd} />}
      {v.kind !== 'future' && <NotInMeal day={v.day} entries={v.placed.none} editable always={v.kind === 'past'} />}
      {v.fatNote && <p className="wb-fatnote">{v.fatNote}</p>}
      <SupplementsSection day={v.day} folded={v.kind === 'past'} />
      <HydrationSection day={v.day} today={today} />
    </div>
  );
}
