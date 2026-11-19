import { USUAL_MEAL_CHOICES } from '../../lib/usualMeal.js';
import type { PlanSlot } from '../../types.ts';
import './UsedAsChips.css';

// A food's usual meal and its Beverage switch (brief nutrition-meal-labels-year-repeat): chips in the Used as style, each 44px tall. The meal is one of Breakfast, Lunch, Dinner, Snack or None; Beverage is on when the food carries the Drink label.
export default function UsualMealPicker({ meal, beverage, onMeal, onBeverage }: { meal: PlanSlot | undefined; beverage: boolean; onMeal: (m: PlanSlot | undefined) => void; onBeverage: (on: boolean) => void }) {
  return (
    <>
      <div role="group" aria-label="Usual meal" className="rc-usedas">
        <span className="rc-usedlabel" aria-hidden="true">Usual meal</span>
        <div className="rc-usedchips">
          {USUAL_MEAL_CHOICES.map(c => <button type="button" key={c.label} aria-pressed={(meal ?? null) === c.slot} onClick={() => onMeal(c.slot ?? undefined)}>{c.label}</button>)}
        </div>
        <span className="rc-usedlabel">The add sheet starts here, and every copy on the board with no meal of its own sits here.</span>
      </div>
      <div role="group" aria-label="Beverage" className="rc-usedas">
        <span className="rc-usedlabel" aria-hidden="true">Beverage</span>
        <div className="rc-usedchips">
          <button type="button" aria-pressed={beverage} onClick={() => onBeverage(!beverage)}>{beverage ? 'A drink' : 'Not a drink'}</button>
        </div>
        <span className="rc-usedlabel">On: shows in Drinks, with the Drink label.</span>
      </div>
    </>
  );
}
