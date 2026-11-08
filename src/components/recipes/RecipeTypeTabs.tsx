import { RECIPE_TABS, type RecipeTab } from '../../lib/recipeList.js';

// All / Foods / Meals / Ingredients / Drinks with how many each holds (brief recipes-find-type-tabs). A group of toggle buttons, not role=tab: the list below is one list, filtered.
// The Library passes its own tabs and no counts (it loads a page at a time, so a count would be of what is loaded, not of the Library).
export default function RecipeTypeTabs({ value, counts, onChange, tabs = RECIPE_TABS }: { value: RecipeTab; counts?: Record<RecipeTab, number>; onChange: (t: RecipeTab) => void; tabs?: readonly { key: RecipeTab; label: string }[] }) {
  return (
    <div className="rc-tabs" role="group" aria-label="Food type">
      {tabs.map(t => (
        <button type="button" key={t.key} id={`recipes-tab-${t.key}`} aria-pressed={value === t.key} onClick={() => onChange(t.key)}>{t.label}{counts && <span className="rc-count">{counts[t.key]}</span>}</button>
      ))}
    </div>
  );
}
