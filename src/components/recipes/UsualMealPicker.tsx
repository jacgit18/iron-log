import { USUAL_MEAL_CHOICES } from '../../lib/usualMeal.js';
import type { PlanSlot } from '../../types.ts';
import './UsedAsChips.css';

// A food's usual meal (brief nutrition-meal-labels-year-repeat): chips in the Used as style, each 44px tall, one of Breakfast, Lunch, Dinner, Snack or None. Whether the food is a drink is the Drink chip in Used as, not a second control here.
export default function UsualMealPicker({ meal, onMeal }: { meal: PlanSlot | undefined; onMeal: (m: PlanSlot | undefined) => void }) {
  return (
    <>
      <div role="group" aria-label="Usual meal" className="rc-usedas">
        <span className="rc-usedlabel" aria-hidden="true">Usual meal</span>
        <div className="rc-usedchips">
          {USUAL_MEAL_CHOICES.map(c => <button type="button" key={c.label} aria-pressed={(meal ?? null) === c.slot} onClick={() => onMeal(c.slot ?? undefined)}>{c.label}</button>)}
        </div>
        <span className="rc-usedlabel">The add sheet starts here, and every copy on the board with no meal of its own sits here.</span>
      </div>
    </>
  );
}
