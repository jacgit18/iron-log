import { entryText } from '../../lib/dietLog.js';
import { shortDay } from '../../lib/nutritionBoard.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { DietEntry } from '../../types.ts';
import Icon from '../Icon.jsx';
import './EatenRows.css';

// Eaten food that no planned item's check added (brief nutrition-items-row-sheet-and-more). Today it sits in its meal (MealSections) or in "Not in a meal"; each row is one button that opens the row sheet (EatenRowSheet), so a row carries no inline Edit or Delete.
// An earlier day's rows open the row sheet too (brief nutrition-any-day-add), and every row has Move to and Copy to (brief nutrition-move-copy-eaten). `onMsg` is the board's status line, for the sentence after a move or copy.
export function EatenRow({ e, onMsg }: { e: DietEntry; onMsg: (t: string) => void }) {
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
    </li>
  );
}

export function EatenRows({ label, entries, onMsg }: { label: string; entries: readonly DietEntry[]; onMsg: (t: string) => void }) {
  if (entries.length === 0) return null;
  return <ul className="nb-eatlist" aria-label={label}>{entries.map(e => <EatenRow key={e.id} e={e} onMsg={onMsg} />)}</ul>;
}

/** The group at the end of a day for food with no meal: today's entries with no hour, and every entry on an earlier day. A past day always shows it (with "Nothing logged"); today shows it only when it holds something. */
export default function NotInMeal({ day, entries, onMsg, always = false }: { day: string; entries: readonly DietEntry[]; onMsg: (t: string) => void; always?: boolean }) {
  if (entries.length === 0 && !always) return null;
  return (
    <div className="wb-slot nb-eaten">
      <div className="wb-slothd"><b>Not in a meal</b><span>{entries.length ? `${entries.length} logged` : ''}</span></div>
      {entries.length === 0 && <span className="nb-empty">Nothing logged</span>}
      <EatenRows label={`Not in a meal on ${shortDay(day)}`} entries={entries} onMsg={onMsg} />
    </div>
  );
}
