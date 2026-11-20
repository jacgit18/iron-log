import { useState } from 'react';
import { DAY_BUTTONS, EVERY_DAY, WEEKDAYS, handyMealFor, handySummary, repeatFor, repeatSummary, sameDays, toggleWeekday } from '../../lib/repeats.js';
import { drinkIdsOf } from '../../lib/recipeUses.js';
import { isDrinkItem } from '../../shared/diet.js';
import { shortDay } from '../../lib/nutritionBoard.js';
import { SLOT_LABEL } from '../../lib/weekBoard.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { PlanSlot } from '../../types.ts';
import ArmedButton from '../ArmedButton.js';
import Sheet from '../Sheet.js';
import './RepeatSheet.css';

// The Repeat sheet (brief nutrition-meal-labels-year-repeat, option A; Keep handy from brief nutrition-keep-handy): Every day, Weekdays and Keep handy as shortcuts and the days M to S as ticks, one sentence saying what it means, Skip this day only and Stop repeating for an item that already repeats. The item stays one stored repeat (cfg.diet.repeats) shown on each matching day of the next 52 weeks.
// `modal.day` is the card's day, `modal.item` the food (kind, id, portion, meal), `modal.name` its name, `modal.rp` the repeat it is shown from (when it is a shown repeat), `modal.onMsg` hands a sentence back to the board.
export default function RepeatSheet() {
  const modal = useAppStore(s => s.modal);
  const closeModal = useAppStore(s => s.closeModal);
  const repeats = useAppStore(s => s.cfg.diet?.repeats);
  const day = String(modal?.day ?? ''), name = String(modal?.name ?? '');
  const item = modal?.item as { k: 'r' | 'm'; id: string; x?: number; s?: PlanSlot } | undefined;
  const existing = item ? repeatFor(repeats, { ...item, ...(modal?.rp ? { rp: String(modal.rp) } : {}) }, day) : undefined;
  const recipes = useAppStore(s => s.recipes);
  const [handy, setHandy] = useState(() => existing?.h === true);
  const [days, setDays] = useState<number[]>(() => (existing?.h ? [] : [...(existing?.days ?? WEEKDAYS)])); // Keep handy shows no day ticked: it is every day, held in the tray
  const [msg, setMsg] = useState('');
  const say = (t: string) => (modal?.onMsg as ((t: string) => void) | undefined)?.(t);
  const st = () => useAppStore.getState();
  if (!item) return null;
  const meal = item.s ? SLOT_LABEL[item.s] : 'no meal';
  const handyMeal = existing?.s ?? handyMealFor(item, recipes), canHandy = item.k === 'r' && !isDrinkItem(item, drinkIdsOf(recipes)); // a handy food waits in a meal's tray; a drink has no meal and saved meals are gone
  const pick = (next: number[]) => { setHandy(false); setDays(next); setMsg(''); };
  const save = () => {
    const err = st().saveRepeat(existing?.from ?? day, handy ? { ...item, s: handyMeal } : item, handy ? [...EVERY_DAY] : days, existing?.rid, handy);
    if (err) { setMsg(err); return; }
    if (handy) say(`${name} is kept handy for ${SLOT_LABEL[handyMeal]}.`); else say(`${name} repeats ${days.length === 7 ? 'every day' : sameDays(days, WEEKDAYS) ? 'on weekdays' : 'on the days you picked'}.`);
    closeModal();
  };
  return (
    <Sheet className="nbsheet" aria-label={`Repeat ${name}`}>
      <h2 className="cond">Repeat {name}</h2>
      <p className="note">{shortDay(day)} · {meal}</p>
      <div className="nb-rp-short" role="group" aria-label="Repeat shortcuts">
        <button type="button" className="btn sm" aria-pressed={sameDays(days, EVERY_DAY)} onClick={() => pick([...EVERY_DAY])}>Every day</button>
        <button type="button" className="btn sm" aria-pressed={sameDays(days, WEEKDAYS)} onClick={() => pick([...WEEKDAYS])}>Weekdays</button>
        {canHandy && <button type="button" className="btn sm" aria-pressed={handy} onClick={() => { setHandy(true); setDays([]); setMsg(''); }}>Keep handy</button>}
      </div>
      <div className="nb-rp-days" role="group" aria-label="Repeat on these days">
        {DAY_BUTTONS.map(b => <button key={b.day} type="button" className="btn nb-rp-day" aria-pressed={days.includes(b.day)} aria-label={b.name} onClick={() => pick(toggleWeekday(days, b.day))}>{b.letter}</button>)}
      </div>
      <p className="note" role="status">{handy ? handySummary(SLOT_LABEL[handyMeal]) : repeatSummary(days, meal, shortDay(existing?.from ?? day))}</p>
      {msg && <p className="note" role="alert">{msg}</p>}
      <div className="actions">
        {existing && !existing.h && !!modal?.rp && <button type="button" className="btn" onClick={() => { st().skipRepeatDay(day, existing.rid); say(`${name} is skipped on ${shortDay(day)} only.`); closeModal(); }}>Skip this day only</button>}
        {existing && <ArmedButton className="btn" aria-label={`Stop repeating ${name}`} label="Stop repeating" armedLabel="Tap again to stop" onConfirm={() => { st().stopRepeat(existing.rid); say(`${name} no longer repeats.`); closeModal(); }} />}
        <button type="button" className="btn" onClick={closeModal}>Cancel</button>
        <button type="button" className="btn primary" disabled={!handy && days.length === 0} onClick={save}>{handy ? 'Keep handy' : existing ? 'Save' : 'Repeat'}</button>
      </div>
    </Sheet>
  );
}
