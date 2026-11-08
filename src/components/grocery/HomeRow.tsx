import { useAppStore } from '../../store/useAppStore.js';
import { homeStateText } from '../../lib/groceryHomeState.js';
import type { GroceryItem } from '../../types.ts';
import './InventoryState.css';

/* ---------- At home ---------- */
// "Have" is one tick shared with To get: a When-out item has it unless it is out (ticking it bought on To get clears "out"), and an
// Every-month item has it once it is ticked bought this month. So a tick on either list shows on the other.
export default function HomeRow({ item, have, boughtText, onHave, last }: { item: GroceryItem; have: boolean; boughtText: string; onHave: (on: boolean) => void; last: string }) {
  return (
    <li className="ghome">
      <label className="gtick">
        <input type="checkbox" className="chk" id={`groc-have-${item.id}`} aria-label={`Have ${item.n}`} checked={have} onChange={e => onHave(e.target.checked)} />
        <span className="gtickname">{item.n}{item.note && <small className="gnote">{item.note}</small>}</span>
      </label>
      <span className={`ghomestate${have ? '' : ' need'}`}>{homeStateText(have)}</span>
      {boughtText && <small className="ghomebought">{boughtText}</small>}
      {last && <button type="button" className="ghistory" id={`groc-history-${item.id}`} aria-label={`${last}. Open price history for ${item.n}`} onClick={() => useAppStore.getState().openModal({ type: 'pricehistory', id: item.id })}>{last}</button>}
    </li>
  );
}
