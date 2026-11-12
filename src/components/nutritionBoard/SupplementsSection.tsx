import { useMemo, useState } from 'react';
import { entriesOn } from '../../lib/dietLog.js';
import { dayNutrientMeter, sectionTotalsVisible } from '../../lib/dayNutrientMeter.js';
import { shortDay, supplementDay } from '../../lib/nutritionBoard.js';
import { capWarning } from '../../lib/supplementIngredients.js';
import { hasFoodData, limitWarning, totalsView } from '../../lib/supplementTotalsView.js';
import { useAppStore } from '../../store/useAppStore.js';
import Icon from '../Icon.jsx';
import './SupplementTotals.css';

// A day's Supplements (brief nutrition-board): Morning, Noon and Night with a tick each and "x of n taken". Ticking works on any day, last week and days ahead too.
// A past day (`folded`) keeps the header's "x of n taken" as the one line and unfolds the ticks on a tap (brief nutrition-header-sheet-wording).
// Also took opens a picker of library supplements with no time of day: one tap ticks one for the day (brief nutrition-items-row-sheet-and-more); they list under "Also taken". Manage in the header keeps the library.
// Totals opens the vitamin and mineral totals sheet (shown when something is scheduled or a food eaten that day lists vitamins or minerals, and the day's vitamin meter is not drawing its rows: that meter reaches the same sheet, `sectionTotalsVisible`); a line under the ticks appears only when a total of what was taken
// and eaten passes its limit (briefs supplement-nutrient-totals, food-vitamins-minerals).
export default function SupplementsSection({ day, folded = false }: { day: string; folded?: boolean }) {
  const [open, setOpen] = useState(false); // a past day shows one summary line until tapped
  const supp = useAppStore(s => s.supp);
  const diet = useAppStore(s => s.diet);
  const profile = useAppStore(s => s.cfg.profile);
  const v = supplementDay(supp, day);
  const eaten = entriesOn(diet, day);
  const limits = useAppStore(s => s.cfg.ingredientLimits);
  const fold = folded && v.total > 0;
  const warn = limitWarning(supp.items, supp.taken, day, eaten, profile);
  const meter = useMemo(() => dayNutrientMeter(totalsView(supp.items, supp.taken, day, 'taken', entriesOn(diet, day), profile)), [supp.items, supp.taken, day, diet, profile]); // once per change, not on every render of every day column
  const showTotals = sectionTotalsVisible(v.total > 0 || hasFoodData(eaten), meter);
  const capWarn = capWarning(supp.items, supp.taken, day, limits);
  return (
    <div className="wb-slot nb-supps" role="group" aria-labelledby={`nb-supp-h-${day}`}>
      {fold ? (
        <button type="button" className="nb-fold" aria-expanded={open} aria-controls={`nb-supp-ticks-${day}`} onClick={() => setOpen(o => !o)}>
          <span className="wb-slothd"><b id={`nb-supp-h-${day}`}>Supplements</b><span>{v.text}</span></span>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} />
        </button>
      ) : <div className="wb-slothd"><b id={`nb-supp-h-${day}`}>Supplements</b><span>{v.total ? v.text : ''}</span></div>}
      {v.total === 0 && !fold && <span className="nb-empty">Nothing scheduled</span>}
      <div id={`nb-supp-ticks-${day}`} hidden={fold && !open}>
      {v.slots.filter(s => s.items.length > 0).map(s => (
        <div key={s.slot} className="nb-suppslot">
          <span className="nb-slotlab">{s.label}</span>
          {s.items.map(i => (
            <label key={i.id} className={`nb-tick${i.taken ? ' taken' : ''}`}>
              <input type="checkbox" className="chk" id={`nb-supp-${day}-${i.id}`} checked={i.taken} onChange={e => useAppStore.getState().setSupplementTaken(day, i.id, e.target.checked)} />
              <span>{i.n}{i.dose && <small> {i.dose}</small>}{i.tag && <small className="nb-portion"> {i.tag}</small>}</span>
            </label>
          ))}
        </div>
      ))}
      </div>
      {v.extra.length > 0 && (
        <div className="nb-suppslot">
          <span className="nb-slotlab">Also taken</span>
          {v.extra.map(i => (
            <label key={i.id} className="nb-tick taken">
              <input type="checkbox" className="chk" id={`nb-supp-${day}-${i.id}`} checked onChange={e => useAppStore.getState().setSupplementTaken(day, i.id, e.target.checked)} />
              <span>{i.n}{i.dose && <small> {i.dose}</small>}</span>
            </label>
          ))}
        </div>
      )}
      {warn && <p className="nb-suppwarn" role="status">{warn}</p>}
      {capWarn && <p className="nb-suppwarn" id={`nb-supp-capwarn-${day}`} role="status">{capWarn}</p>}
      <div className="nb-suppact">
        <button type="button" className="btn sm" id={`nb-supp-add-${day}`} aria-label={`Also took a supplement on ${shortDay(day)}`} onClick={() => useAppStore.getState().openModal({ type: 'nbsuppick', day })}>Also took</button>
        {showTotals && <button type="button" className="btn sm" id={`nb-supp-totals-${day}`} aria-label={`Totals for ${shortDay(day)}`} onClick={() => useAppStore.getState().openModal({ type: 'nbsupptotals', day })}>Totals</button>}
      </div>
    </div>
  );
}
