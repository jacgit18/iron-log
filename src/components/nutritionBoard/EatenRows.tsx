import { entryText } from '../../lib/dietLog.js';
import { hasStepper, rowStepper } from '../../lib/eatenStep.js';
import { shortDay } from '../../lib/nutritionBoard.js';
import { ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import type { DietEntry } from '../../types.ts';
import Icon from '../Icon.jsx';
import { stepEatenRow } from './stepEatenRow.js';
import './EatenRows.css';

// Eaten food that no planned item's check added (brief nutrition-items-row-sheet-and-more). Today it sits in its meal (MealSections) or in "Not in a meal"; each row is one button that opens the row sheet (EatenRowSheet), so a row carries no inline Edit or Delete.
// Less, the amount and More sit on the row itself (brief nutrition-log-first-portion-row, option A): a tap steps the entry's portion by half through `setDietPortion`; on a food logged today from a recipe the new amount also becomes its usual (notice with Undo, on `onMsg`'s second argument).
// An earlier day's rows open the row sheet too (brief nutrition-any-day-add), and every row has Move to and Copy to (brief nutrition-move-copy-eaten). `onMsg` is the board's status line, for the sentence after a move or copy.
/** The board's status line: a sentence and, when the change can be taken back, its Undo. */
export type Say = (t: string, undo?: () => void) => void;

export function EatenRow({ e, onMsg }: { e: DietEntry; onMsg: Say }) {
  const today = ymd(useToday(s => s.today));
  const recipe = useAppStore(s => (e.from ? s.recipes.find(r => r.id === e.from) : undefined));
  const step = rowStepper(e, recipe);
  const body = (
    <>
      <span className="nb-eatn">{e.n}</span>
      <span className="wb-cm">{entryText(e)}</span>
      <span className="nb-eatmark"><Icon name="check" />Eaten</span>
    </>
  );
  return (
    <li className="nb-eat">
      <button type="button" className="nb-eatrow" aria-haspopup="dialog" onClick={() => useAppStore.getState().openModal({ type: 'nbeaten', id: e.id, onMsg })}>{body}</button>
      {hasStepper(e.d, today) && (
        <div className="nb-step" role="group" aria-label={`Portion of ${e.n}`}>
          <button type="button" className="btn sm" aria-label={`Less ${e.n}`} disabled={step.less === null} onClick={() => step.less !== null && stepEatenRow(e, step.less, recipe, today, onMsg)}>Less</button>
          <span className="nb-stepamt">{step.text}</span>
          <button type="button" className="btn sm" aria-label={`More ${e.n}`} disabled={step.more === null} onClick={() => step.more !== null && stepEatenRow(e, step.more, recipe, today, onMsg)}>More</button>
        </div>
      )}
    </li>
  );
}

export function EatenRows({ label, entries, onMsg }: { label: string; entries: readonly DietEntry[]; onMsg: Say }) {
  if (entries.length === 0) return null;
  return <ul className="nb-eatlist" aria-label={label}>{entries.map(e => <EatenRow key={e.id} e={e} onMsg={onMsg} />)}</ul>;
}

/** The group at the end of a day for food with no meal: today's entries with no hour, and every entry on an earlier day. A past day always shows it (with "Nothing logged"); today shows it only when it holds something. */
export default function NotInMeal({ day, entries, onMsg, always = false }: { day: string; entries: readonly DietEntry[]; onMsg: Say; always?: boolean }) {
  if (entries.length === 0 && !always) return null;
  return (
    <div className="wb-slot nb-eaten">
      <div className="wb-slothd"><b>Not in a meal</b><span>{entries.length ? `${entries.length} logged` : ''}</span></div>
      {entries.length === 0 && <span className="nb-empty">Nothing logged</span>}
      <EatenRows label={`Not in a meal on ${shortDay(day)}`} entries={entries} onMsg={onMsg} />
    </div>
  );
}
