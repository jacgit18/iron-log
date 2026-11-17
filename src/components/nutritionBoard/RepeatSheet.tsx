import { useState } from 'react';
import { DAY_BUTTONS, EVERY_DAY, WEEKDAYS, repeatFor, repeatSummary, sameDays, toggleWeekday } from '../../lib/repeats.js';
import { shortDay } from '../../lib/nutritionBoard.js';
import { SLOT_LABEL } from '../../lib/weekBoard.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { PlanSlot } from '../../types.ts';
import ArmedButton from '../ArmedButton.js';
import Sheet from '../Sheet.js';
import './RepeatSheet.css';

// The Repeat sheet (brief nutrition-meal-labels-year-repeat, option A): Every day and Weekdays as shortcuts and the days M to S as ticks, one sentence saying what it means, Skip this day only and Stop repeating for an item that already repeats. The item stays one stored repeat (cfg.diet.repeats) shown on each matching day of the next 52 weeks.
// `modal.day` is the card's day, `modal.item` the food (kind, id, portion, meal), `modal.name` its name, `modal.rp` the repeat it is shown from (when it is a shown repeat), `modal.onMsg` hands a sentence back to the board.
export default function RepeatSheet() {
  const modal = useAppStore(s => s.modal);
  const closeModal = useAppStore(s => s.closeModal);
  const repeats = useAppStore(s => s.cfg.diet?.repeats);
  const day = String(modal?.day ?? ''), name = String(modal?.name ?? '');
  const item = modal?.item as { k: 'r' | 'm'; id: string; x?: number; s?: PlanSlot } | undefined;
  const existing = item ? repeatFor(repeats, { ...item, ...(modal?.rp ? { rp: String(modal.rp) } : {}) }, day) : undefined;
  const [days, setDays] = useState<number[]>(() => [...(existing?.days ?? WEEKDAYS)]);
  const [msg, setMsg] = useState('');
  const say = (t: string) => (modal?.onMsg as ((t: string) => void) | undefined)?.(t);
  const st = () => useAppStore.getState();
  if (!item) return null;
  const meal = item.s ? SLOT_LABEL[item.s] : 'no meal';
  const save = () => {
    const err = st().saveRepeat(existing?.from ?? day, item, days, existing?.rid);
    if (err) { setMsg(err); return; }
    say(`${name} repeats ${days.length === 7 ? 'every day' : sameDays(days, WEEKDAYS) ? 'on weekdays' : 'on the days you picked'}.`);
    closeModal();
  };
  return (
    <Sheet className="nbsheet" aria-label={`Repeat ${name}`}>
      <h2 className="cond">Repeat {name}</h2>
      <p className="note">{shortDay(day)} · {meal}</p>
      <div className="nb-rp-short" role="group" aria-label="Repeat shortcuts">
        <button type="button" className="btn sm" aria-pressed={sameDays(days, EVERY_DAY)} onClick={() => setDays([...EVERY_DAY])}>Every day</button>
        <button type="button" className="btn sm" aria-pressed={sameDays(days, WEEKDAYS)} onClick={() => setDays([...WEEKDAYS])}>Weekdays</button>
      </div>
      <div className="nb-rp-days" role="group" aria-label="Repeat on these days">
        {DAY_BUTTONS.map(b => <button key={b.day} type="button" className="btn nb-rp-day" aria-pressed={days.includes(b.day)} aria-label={b.name} onClick={() => { setDays(toggleWeekday(days, b.day)); setMsg(''); }}>{b.letter}</button>)}
      </div>
      <p className="note" role="status">{repeatSummary(days, meal, shortDay(existing?.from ?? day))}</p>
      {msg && <p className="note" role="alert">{msg}</p>}
      <div className="actions">
        {existing && !!modal?.rp && <button type="button" className="btn" onClick={() => { st().skipRepeatDay(day, existing.rid); say(`${name} is skipped on ${shortDay(day)} only.`); closeModal(); }}>Skip this day only</button>}
        {existing && <ArmedButton className="btn" aria-label={`Stop repeating ${name}`} label="Stop repeating" armedLabel="Tap again to stop" onConfirm={() => { st().stopRepeat(existing.rid); say(`${name} no longer repeats.`); closeModal(); }} />}
        <button type="button" className="btn" onClick={closeModal}>Cancel</button>
        <button type="button" className="btn primary" disabled={days.length === 0} onClick={save}>{existing ? 'Save' : 'Repeat'}</button>
      </div>
    </Sheet>
  );
}
