import { useState } from 'react';
import { dayIngredientMeter, ingredientClosedText } from '../../lib/dayIngredientMeter.js';
import { ingredientRows } from '../../lib/supplementIngredients.js';
import { useAppStore } from '../../store/useAppStore.js';
import Icon from '../Icon.js';

// Active ingredients under a day's Supplements meter (brief ingredient-day-bars, layout A): a closed line naming the two nearest the limits you set, and on a tap thin bars for up to five.
// It reads the same rows as the Totals sheet (`lib/dayIngredientMeter.ts`); an ingredient with no limit has no bar here. Same look as the vitamins line (`DayVitMeter`).
export default function DayIngredientMeter({ day }: { day: string }) {
  const supp = useAppStore(s => s.supp);
  const limits = useAppStore(s => s.cfg.ingredientLimits);
  const [open, setOpen] = useState(false);
  const m = dayIngredientMeter(ingredientRows(supp.items, supp.taken, day, 'taken', limits));
  if (!m) return null;
  if (m.kind === 'none') return <p className="wb-fatnote nb-vit-none" id={`nb-ing-${day}`}>Active ingredients: nothing ticked yet</p>;
  return (
    <div className="nb-vit" id={`nb-ing-${day}`}>
      <button type="button" className="nb-vit-tog" aria-expanded={open} aria-controls={`nb-ing-list-${day}`} onClick={() => setOpen(!open)}>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} />
        <span>Active ingredients: {m.top.map((t, i) => <span key={t.key}>{i > 0 && ' · '}<b className={`nb-vit-${t.status}`}>{ingredientClosedText(t)}</b></span>)}</span>
      </button>
      {open && (
        <div className="nb-vit-list" id={`nb-ing-list-${day}`}>
          {m.subs.map(s => (
            <div key={s.key} className={`nb-vit-sub ${s.status}`}>
              <div className="wb-barl"><span>{s.label}</span><b className={`nb-vit-${s.status}`}>{s.text}</b></div>
              <div className={`wb-meter nb-ing-meter${s.status === 'over' ? ' over' : ''}`} role="img" aria-label={s.name}><i style={{ width: `${s.percent}%` }} /></div>
            </div>
          ))}
          <button type="button" className="nb-vit-all" onClick={() => useAppStore.getState().openModal({ type: 'nbsupptotals', day })}>{m.hidden > 0 ? `All ${m.tracked} in Totals` : 'Open Totals'}</button>
        </div>
      )}
    </div>
  );
}
