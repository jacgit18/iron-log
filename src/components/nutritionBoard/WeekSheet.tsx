import { useMemo } from 'react';
import { oldestLogged, weekChoices, weekOf, weekRange } from '../../lib/nutritionBoard.js';
import { dayToShow, usePickedDay } from '../../lib/nutritionDayPick.js';
import { ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import Sheet from '../Sheet.js';
import WeekList from './WeekList.js';

// Choose a week on a phone (brief nutrition-meal-labels-year-repeat, option A): the list of every week as a bottom sheet with a Close button; picking a week shows it and closes. `modal.onPick` is the board's week change.
export default function WeekSheet() {
  const modal = useAppStore(s => s.modal);
  const closeModal = useAppStore(s => s.closeModal);
  const diet = useAppStore(s => s.diet);
  const today = ymd(useToday(s => s.today));
  const kept = usePickedDay();
  const oldest = useMemo(() => oldestLogged(diet), [diet]);
  const range = useMemo(() => weekRange(today, oldest), [today, oldest]);
  const current = weekOf(today, dayToShow(kept, today, oldest));
  const pick = (o: number) => { (modal?.onPick as ((o: number) => void) | undefined)?.(o); closeModal(); };
  return (
    <Sheet className="nbsheet" aria-label="Choose a week">
      <h2 className="cond">Choose a week</h2>
      <WeekList choices={weekChoices(today, range)} current={current} onPick={pick} />
      <div className="actions"><button type="button" className="btn primary" onClick={closeModal}>Close</button></div>
    </Sheet>
  );
}
