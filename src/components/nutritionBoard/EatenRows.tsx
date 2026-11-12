import { entryText } from '../../lib/dietLog.js';
import { shortDay } from '../../lib/nutritionBoard.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { DietEntry } from '../../types.ts';
import Icon from '../Icon.jsx';
import './EatenRows.css';

// Eaten food that no planned item's check added (brief nutrition-items-row-sheet-and-more). Today it sits in its meal (MealSections) or in "Not in a meal"; each row is one button that opens the row sheet (EatenRowSheet), so a row carries no inline Edit or Delete.
// An earlier day's rows are plain text: only today's food can be changed.
export function EatenRow({ e, editable }: { e: DietEntry; editable: boolean }) {
  const body = (
    <>
      <span className="nb-eatn">{e.n}</span>
      <span className="wb-cm">{entryText(e)}</span>
      <span className="nb-eatmark"><Icon name="check" />Eaten</span>
    </>
  );
  return (
    <li className="nb-eat">
      {editable
        ? <button type="button" className="nb-eatrow" aria-haspopup="dialog" onClick={() => useAppStore.getState().openModal({ type: 'nbeaten', id: e.id })}>{body}</button>
        : <div className="nb-eatrow ro">{body}</div>}
    </li>
  );
}

export function EatenRows({ label, entries, editable }: { label: string; entries: readonly DietEntry[]; editable: boolean }) {
  if (entries.length === 0) return null;
  return <ul className="nb-eatlist" aria-label={label}>{entries.map(e => <EatenRow key={e.id} e={e} editable={editable} />)}</ul>;
}

/** The group at the end of a day for food with no meal: today's entries with no hour, and every entry on an earlier day. A past day always shows it (with "Nothing logged"); today shows it only when it holds something. */
export default function NotInMeal({ day, entries, editable, always = false }: { day: string; entries: readonly DietEntry[]; editable: boolean; always?: boolean }) {
  if (entries.length === 0 && !always) return null;
  return (
    <div className="wb-slot nb-eaten">
      <div className="wb-slothd"><b>Not in a meal</b><span>{entries.length ? `${entries.length} logged` : ''}</span></div>
      {entries.length === 0 && <span className="nb-empty">Nothing logged</span>}
      <EatenRows label={`Not in a meal on ${shortDay(day)}`} entries={entries} editable={editable} />
    </div>
  );
}
