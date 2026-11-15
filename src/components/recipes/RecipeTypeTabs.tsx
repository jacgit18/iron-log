import Icon from '../Icon.js';
import '../Pill.css';
import { RECIPE_TABS, type RecipeTab } from '../../lib/recipeList.js';

// One row of pills that scrolls sideways (brief recipes-list-compact): Recent (favourites and recently used, only when there are some), then All / Foods / Meals / Ingredients / Drinks with how many each holds.
// A group of toggle buttons, not role=tab: the list below is one list, filtered. `value` is null while Recent is on.
// The Library passes its own tabs, no counts (it loads a page at a time, so a count would be of what is loaded) and no Recent.
type Recent = { on: boolean; onToggle: () => void };
export default function RecipeTypeTabs({ value, counts, onChange, tabs = RECIPE_TABS, recent }: { value: RecipeTab | null; counts?: Record<RecipeTab, number>; onChange: (t: RecipeTab) => void; tabs?: readonly { key: RecipeTab; label: string }[]; recent?: Recent }) {
  return (
    <div className="rc-tabs" role="group" aria-label="Food type">
      {recent && <button type="button" className="pillbtn" id="recipes-recent" aria-pressed={recent.on} onClick={recent.onToggle}><Icon name="star-fill" />Recent</button>}
      {tabs.map(t => (
        <button type="button" className="pillbtn" key={t.key} id={`recipes-tab-${t.key}`} aria-pressed={value === t.key} onClick={() => onChange(t.key)}>{t.label}{counts && <span className="rc-count">{counts[t.key]}</span>}</button>
      ))}
    </div>
  );
}
