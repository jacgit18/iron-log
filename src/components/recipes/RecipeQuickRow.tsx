import Icon from '../Icon.js';
import type { Recipe } from '../../types.ts';

// Favorites (starred) and recently used recipes as chips above the list (brief recipes-find-type-tabs); a chip opens that item.
export default function RecipeQuickRow({ picks, onOpen }: { picks: { recipe: Recipe; fav: boolean }[]; onOpen: (id: string) => void }) {
  if (!picks.length) return null;
  return (
    <div className="rc-quick" role="group" aria-label="Recent and favorites">
      {picks.map(({ recipe, fav }) => (
        <button type="button" key={recipe.id} onClick={() => onOpen(recipe.id)}>{fav && <Icon name="star-fill" />}{recipe.n}</button>
      ))}
    </div>
  );
}
