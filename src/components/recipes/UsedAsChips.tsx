import { toggleUse } from '../../lib/recipeUses.js';
import { RECIPE_USE_LABEL } from '../../shared/recipes.js';
import type { RecipeUse } from '../../types.ts';
import './UsedAsChips.css';

// What a recipe or food is used as (brief recipes-used-as-ingredients-tab): one or more chips, each 44px tall, at least one always on.
export default function UsedAsChips({ value, options, onChange, name = 'Used as' }: { name?: string; value: readonly RecipeUse[]; options: readonly RecipeUse[]; onChange: (next: RecipeUse[]) => void }) {
  return (
    <div role="group" aria-label={name} className="rc-usedas">
      <span className="rc-usedlabel" aria-hidden="true">Used as</span>
      <div className="rc-usedchips">
        {options.map(u => <button type="button" key={u} aria-pressed={value.includes(u)} onClick={() => onChange(toggleUse(value, u))}>{RECIPE_USE_LABEL[u]}</button>)}
      </div>
    </div>
  );
}
