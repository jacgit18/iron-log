import Icon from '../Icon.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { Recipe } from '../../types.ts';

// The favorite star, in the recipe's own header (brief recipe-star-placement): it used to sit on the list row, over Log and the at-home count.
// Only a recipe of yours has one; a library recipe is not in Mine yet, so there is nothing to star.
export default function RecipeStar({ recipe, mine }: { recipe: Recipe; mine: boolean }) {
  const saved = useAppStore(s => s.recipes.find(r => r.id === recipe.id));
  if (!mine || !saved) return null;
  const on = !!saved.fav;
  return (
    <button type="button" className="rc-star" aria-pressed={on} aria-label={`${on ? 'Unstar' : 'Star'} ${recipe.n}`} onClick={() => useAppStore.getState().toggleRecipeFav(recipe.id)}>
      <Icon name={on ? 'star-fill' : 'star'} />
    </button>
  );
}
