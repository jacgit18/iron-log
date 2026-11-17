import { useState } from 'react';
import type { Say } from '../../lib/eatenStep.js';
import type { Resolved } from '../../lib/dietPlan.js';
import { planItemKey } from '../../shared/diet.js';
import type { BoardDay } from '../../lib/weekBoard.js';
import BoardCard from '../diet/board/BoardCard.js';
import './DrinksSection.css';

// A day's Drinks (brief nutrition-meal-labels-year-repeat): the planned foods that carry the Drink label, in one list under the meals. Outside every meal's plate check and the 8-item cap; their calories still count in the day. Shown only when the day has a drink; one is added from the Add sheet like any recipe and lands here.
export default function DrinksSection({ view, today, onLog, onMsg }: { view: BoardDay; today: string; onLog: (r: Resolved, index: number) => void; onMsg: Say }) {
  const [open, setOpen] = useState<string | null>(null);
  if (view.drinks.length === 0) return null;
  const kcal = view.drinks.reduce((a, x) => a + (x.r.gone ? 0 : x.r.kcal ?? 0), 0);
  return (
    <section className="wb-slot nb-drinks" aria-label="Drinks">
      <div className="wb-slothd"><b>Drinks</b><span>{Math.round(kcal).toLocaleString('en-US')} kcal</span></div>
      <p className="nb-drinksnote">Not in the plate check or the 8-item limit.</p>
      {view.drinks.map(x => {
        const ck = `${view.day}:${planItemKey(x.r.item)}`;
        return <BoardCard key={ck} item={x} day={view.day} today={today} open={open === ck} onOpen={() => setOpen(open === ck ? null : ck)} onLog={onLog} onMsg={onMsg} />;
      })}
    </section>
  );
}
