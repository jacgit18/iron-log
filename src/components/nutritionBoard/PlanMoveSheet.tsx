import { useState } from 'react';
import { goLabel, moveButton } from '../../lib/dayPicker.js';
import { shortDay } from '../../lib/nutritionBoard.js';
import { SLOT_LABEL } from '../../lib/weekBoard.js';
import { PLAN_SLOTS } from '../../shared/diet.js';
import { ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import type { PlanSlot } from '../../types.ts';
import Sheet from '../Sheet.js';
import DayPicker from './DayPicker.js';

// Copy to and Move to on a planned card (brief nutrition-multi-day-picker): the day picker and one button. Copy ticks several days and keeps the meal; Move takes one day and a meal chip (a meal alone moves the card within its day).
// `modal.day` is the card's day, `modal.name` its name, `modal.slot` its meal, `modal.prepare` stores a shown daily snack and gives the card's place in the plan (-1 when that failed), `modal.onMsg` hands the sentence back to the board.
export default function PlanMoveSheet() {
  const modal = useAppStore(s => s.modal);
  const closeModal = useAppStore(s => s.closeModal);
  const today = ymd(useToday(s => s.today));
  const day = String(modal?.day ?? ''), name = String(modal?.name ?? ''), move = modal?.mode === 'move';
  const slot = PLAN_SLOTS.find(s => s === modal?.slot);
  const [picked, setPicked] = useState<string[]>([]);
  const [meal, setMeal] = useState<PlanSlot | undefined>(slot);
  const say = (t: string) => (modal?.onMsg as ((t: string) => void) | undefined)?.(t);
  const go = () => {
    const at = (modal?.prepare as (() => number) | undefined)?.() ?? -1;
    if (at < 0) { closeModal(); return; }
    const st = useAppStore.getState();
    if (move) {
      const toDay = picked[0] ?? day;
      say(st.movePlanItem(day, at, toDay, meal) ?? `Moved to ${toDay === day ? SLOT_LABEL[meal!] : shortDay(toDay)}.`);
    } else say(st.copyPlanItems(day, at, picked).message);
    closeModal();
  };
  const mv = moveButton(picked, meal, slot, m => SLOT_LABEL[m as PlanSlot]);
  return (
    <Sheet className="nbsheet" aria-label={`${move ? 'Move' : 'Copy'} ${name}`}>
      <h2 className="cond">{move ? 'Move' : 'Copy'} {name}</h2>
      <p className="note">{shortDay(day)}{slot ? ` · ${SLOT_LABEL[slot]}` : ''}</p>
      <DayPicker source={{ kind: 'plan', day }} today={today} picked={picked} onPick={setPicked} single={move} label={`${move ? 'Move' : 'Copy'} ${name} to day`} />
      {move && (
        <div role="group" aria-label={`Meal for ${name}`}>
          <p className="note" id="nb-pm-meal">Meal</p>
          <div className="seg" role="group" aria-labelledby="nb-pm-meal">
            {PLAN_SLOTS.map(s => <button key={s} type="button" aria-pressed={meal === s} onClick={() => setMeal(s)}>{SLOT_LABEL[s]}</button>)}
          </div>
        </div>
      )}
      <div className="actions">
        <button type="button" className="btn" onClick={closeModal}>Cancel</button>
        <button type="button" className="btn primary" disabled={move ? !mv.enabled : !picked.length} onClick={go}>{move ? mv.label : goLabel('Copy', picked)}</button>
      </div>
    </Sheet>
  );
}
