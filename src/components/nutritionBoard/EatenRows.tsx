import { useMemo } from 'react';
import { entryText } from '../../lib/dietLog.js';
import { rowStepper, type Say } from '../../lib/eatenStep.js';
import { shortDay } from '../../lib/nutritionBoard.js';
import { ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import type { DietEntry, Recipe } from '../../types.ts';
import Icon from '../Icon.jsx';
import PortionStepper from '../PortionStepper.js';
import { stepEatenRow } from './stepEatenRow.js';
import { MicroLine } from './MicroLine.js';
import './EatenRows.css';

// Eaten food that no planned item's check added (brief nutrition-items-row-sheet-and-more). Today it sits in its meal (MealSections) or in "Not in a meal"; each row is one button that opens the row sheet (EatenRowSheet), so a row carries no inline Edit or Delete.
// Less, the amount and More sit on the row itself (brief nutrition-log-first-portion-row, option A): a tap steps the entry's portion by half through `setDietPortion`; the entry changes only. On a food logged today from a recipe, `onMsg` is also given a "Save N as my usual" button (its third argument), and the person presses it to make the amount the usual (button review N3).
// An earlier day's rows open the row sheet too (brief nutrition-any-day-add), and every row has Move to and Copy to (brief nutrition-move-copy-eaten). `onMsg` is the board's status line, for the sentence after a move or copy.
export function EatenRow({ e, recipe, onMsg }: { e: DietEntry; recipe?: Recipe; onMsg: Say }) {
  const today = ymd(useToday(s => s.today));
  const step = rowStepper(e, recipe);
  const body = (
    <>
      <span className="nb-eatn">{e.n}</span>
      <span className="wb-cm">{entryText(e)}</span>
      <span className="nb-eatmark"><Icon name="check" />Eaten</span>
      <MicroLine micro={e.micro} est={e.est === true} />
    </>
  );
  return (
    <li className="nb-eat">
      <button type="button" className="nb-eatrow" aria-haspopup="dialog" onClick={() => useAppStore.getState().openModal({ type: 'nbeaten', id: e.id, onMsg })}>{body}</button>
      <PortionStepper name={e.n} text={step.text} less={step.less} more={step.more} onLess={to => stepEatenRow(e, to, recipe, today, onMsg)} onMore={to => stepEatenRow(e, to, recipe, today, onMsg)} />
    </li>
  );
}

export function EatenRows({ label, entries, onMsg }: { label: string; entries: readonly DietEntry[]; onMsg: Say }) {
  const recipes = useAppStore(st => st.recipes);
  const byId = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes]); // one lookup per list, not a find per row
  if (entries.length === 0) return null;
  return <ul className="nb-eatlist" aria-label={label}>{entries.map(e => <EatenRow key={e.id} e={e} {...(e.from && byId.get(e.from) ? { recipe: byId.get(e.from)! } : {})} onMsg={onMsg} />)}</ul>;
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
