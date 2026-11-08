import { RECIPE_TABS, type RecipeTab } from '../../lib/recipeList.js';

// All / Foods / Meals / Drinks with how many each holds (brief recipes-find-type-tabs). A group of toggle buttons, not role=tab: the list below is one list, filtered.
export default function RecipeTypeTabs({ value, counts, onChange }: { value: RecipeTab; counts: Record<RecipeTab, number>; onChange: (t: RecipeTab) => void }) {
  return (
    <div className="rc-tabs" role="group" aria-label="Food type">
      {RECIPE_TABS.map(t => (
        <button type="button" key={t.key} id={`recipes-tab-${t.key}`} aria-pressed={value === t.key} onClick={() => onChange(t.key)}>{t.label}<span className="rc-count">{counts[t.key]}</span></button>
      ))}
    </div>
  );
}
