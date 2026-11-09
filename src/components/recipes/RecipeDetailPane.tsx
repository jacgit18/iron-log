import { useSyncExternalStore } from 'react';
import type { Recipe } from '../../types.ts';
import RecipeDetail from './RecipeDetail.js';

// The right-hand side of the Recipes list from 1280 px (brief recipes-find-type-tabs): the selected recipe's own detail, in place. Its "Back to recipes" bar is hidden
// by CSS (.rc-pane) since the list is already beside it; Delete selects the next item through `onGone`.
const WIDE = '(min-width:1280px)';
const subscribe = (notify: () => void) => { const m = window.matchMedia(WIDE); m.addEventListener('change', notify); return () => m.removeEventListener('change', notify); };
/** Whether the screen is wide enough for the list and the detail side by side. */
export const useDetailPaneWidth = (): boolean => useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches, () => false);

export default function RecipeDetailPane({ recipe, onEdit, onGone, onOpen }: { recipe: Recipe | undefined; onEdit: (id: string) => void; onGone: () => void; onOpen: (id: string) => void }) {
  return (
    <aside className="rc-pane" aria-label="Recipe detail">
      {recipe
        ? <RecipeDetail key={recipe.id} recipe={recipe} mine onBack={onGone} onEdit={() => onEdit(recipe.id)} onAdd={onGone} onOpen={onOpen} />
        : <p className="note">Pick a recipe to see it here.</p>}
    </aside>
  );
}
