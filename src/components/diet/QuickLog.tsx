import { useState } from 'react';
import { quickItems } from '../../lib/dietRecent.js';
import type { FoodHit } from '../../shared/foods.js';
import { useAppStore } from '../../store/useAppStore.js';
import ScanFood from './ScanFood.js';
import './Diet.css';

// "Recent and favorites" (brief nutrition-quick-log): the foods you log most as chips, starred first. A tap opens the portion sheet, which logs through the same rules as Ate this.
// "Scan a food" asks the barcode sheet for a product, then ScanFood creates it (with its Type) and logs it in one step. The strip hides when there is nothing to show.
export default function QuickLog({ day, onAdded }: { day: string; onAdded: (text: string) => void }) {
  const diet = useAppStore(s => s.diet);
  const recipes = useAppStore(s => s.recipes);
  const [scanned, setScanned] = useState<FoodHit | null>(null);
  const items = quickItems(diet, recipes);
  const scan = () => useAppStore.getState().openModal({ type: 'barcode', onFound: (h: FoodHit) => setScanned(h) });
  return (
    <div className="dt-quick">
      {items.length > 0 && (
        <>
          <p className="note" id="dt-quick-h">Recent and favorites</p>
          <ul className="dt-recents" aria-labelledby="dt-quick-h">
            {items.map(i => (
              <li key={i.id}>
                <button type="button" className={i.fav ? 'btn sm dt-fav' : 'btn sm'} aria-label={i.fav ? `${i.n}, favorite` : undefined} onClick={() => useAppStore.getState().openModal({ type: 'portion', id: i.id, day })}>{i.n}</button>
              </li>
            ))}
          </ul>
        </>
      )}
      {scanned ? <ScanFood key={scanned.id} hit={scanned} day={day} onDone={onAdded} onCancel={() => setScanned(null)} /> : <button type="button" className="btn sm" id="dt-scan-food" onClick={scan}>Scan a food</button>}
    </div>
  );
}
