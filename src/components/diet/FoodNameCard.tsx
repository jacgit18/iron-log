import type { FoodHit } from '../../shared/foods.js';
import Icon from '../Icon.js';
import './FoodNameCard.css';

// The picked or scanned food, name first (brief scan-item-name): the name is the big line, the brand sits under it and the kcal is small. Used where the one 15px `hitLabel` line was (the result buttons still use `hitLabel`).
// `scanned` adds the "Scanned" tick (a barcode scan); a food picked from typed results has the same card without it.
export default function FoodNameCard({ hit, scanned = false }: { hit: FoodHit; scanned?: boolean }) {
  return (
    <div className="fnc">
      {scanned && <p className="fnc-badge"><Icon name="check" /> Scanned</p>}
      <p className="fnc-name">{hit.name}</p>
      {hit.brand && <p className="fnc-brand">{hit.brand}</p>}
      <p className="fnc-kcal"><b>{hit.kcal} kcal</b> per 100 g</p>
    </div>
  );
}
