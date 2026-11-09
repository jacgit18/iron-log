import { foodEditable, shortDay, type DayView } from '../../lib/nutritionBoard.js';
import type { Resolved } from '../../lib/dietPlan.js';
import DayMeters from './DayMeters.js';
import EatenList from './EatenList.js';
import HydrationSection from './HydrationSection.js';
import MealSections from './MealSections.js';
import SupplementsSection from './SupplementsSection.js';

// One day of the board: its name (tap to pick it as the day the toolbar adds to), four meters, meals or the eaten list, Supplements and Hydration.
// Last week has no meals (the plan holds no past days) and its food is read-only; supplements and water stay editable on every day.
export default function DayColumn({ v, today, selected, days, onPick, onLog, onMsg }: { v: DayView; today: string; selected: boolean; days: { id: string; label: string }[]; onPick: () => void; onLog: (r: Resolved) => void; onMsg: (t: string) => void }) {
  const editable = foodEditable(v.day, today);
  return (
    <div className={`wb-col nb-col${v.day === today ? ' today' : ''}${v.kind === 'past' ? ' past' : ''}${selected ? ' sel' : ''}`} data-day={v.day}>
      <div className="wb-colhd">
        <button type="button" className="nb-dayname" aria-pressed={selected} aria-label={`${shortDay(v.day)}${v.day === today ? ' · today' : ''}, add food here`} onClick={onPick}><b>{shortDay(v.day)}{v.day === today ? ' · today' : ''}</b></button>
      </div>
      <DayMeters v={v} />
      {v.kind !== 'past' && <MealSections view={v.plan} today={today} days={days} editable={editable} onLog={onLog} onMsg={onMsg} />}
      {v.kind !== 'future' && <EatenList day={v.day} entries={v.eaten} editable={v.kind === 'today'} note={v.fatNote} />}
      <SupplementsSection day={v.day} />
      <HydrationSection day={v.day} today={today} />
    </div>
  );
}
