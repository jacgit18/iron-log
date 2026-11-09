import { entriesOn } from '../../lib/dietLog.js';
import { shortDay, supplementDay } from '../../lib/nutritionBoard.js';
import { hasFoodData, limitWarning } from '../../lib/supplementTotalsView.js';
import { useFeature } from '../../features.js';
import { useAppStore } from '../../store/useAppStore.js';
import './SupplementTotals.css';

// A day's Supplements (brief nutrition-board): Morning, Noon and Night with a tick each and "x of n taken". Ticking works on any day, last week and days ahead too.
// Totals opens the vitamin and mineral totals sheet (shown when something is scheduled or a food eaten that day lists vitamins or minerals); a line under the ticks appears only when a total of what was taken
// and eaten passes its limit (briefs supplement-nutrient-totals, food-vitamins-minerals).
export default function SupplementsSection({ day }: { day: string }) {
  const supp = useAppStore(s => s.supp);
  const diet = useAppStore(s => s.diet);
  const v = supplementDay(supp, day);
  const eaten = entriesOn(diet, day);
  const totalsOn = useFeature('supplementTotals');
  const warn = totalsOn ? limitWarning(supp.items, supp.taken, day, eaten) : '';
  return (
    <div className="wb-slot nb-supps" role="group" aria-labelledby={`nb-supp-h-${day}`}>
      <div className="wb-slothd"><b id={`nb-supp-h-${day}`}>Supplements</b><span>{v.total ? v.text : ''}</span></div>
      {v.total === 0 && <span className="nb-empty">Nothing scheduled</span>}
      {v.slots.filter(s => s.items.length > 0).map(s => (
        <div key={s.slot} className="nb-suppslot">
          <span className="nb-slotlab">{s.label}</span>
          {s.items.map(i => (
            <label key={i.id} className={`nb-tick${i.taken ? ' taken' : ''}`}>
              <input type="checkbox" className="chk" id={`nb-supp-${day}-${i.id}`} checked={i.taken} onChange={e => useAppStore.getState().setSupplementTaken(day, i.id, e.target.checked)} />
              <span>{i.n}{i.dose && <small> {i.dose}</small>}</span>
            </label>
          ))}
        </div>
      ))}
      {warn && <p className="nb-suppwarn" role="status">{warn}</p>}
      {totalsOn && (v.total > 0 || hasFoodData(eaten)) && <div className="nb-suppact"><button type="button" className="btn sm" id={`nb-supp-totals-${day}`} aria-label={`Totals for ${shortDay(day)}`} onClick={() => useAppStore.getState().openModal({ type: 'nbsupptotals', day })}>Totals</button></div>}
    </div>
  );
}
