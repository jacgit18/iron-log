import { useState } from 'react';
import { entriesOn } from '../../lib/dietLog.js';
import { dayNutrientMeter } from '../../lib/dayNutrientMeter.js';
import { totalsView } from '../../lib/supplementTotalsView.js';
import { useAppStore } from '../../store/useAppStore.js';
import Icon from '../Icon.js';

// Vitamins and minerals under a day's Supplements meter (brief vitamin-mineral-day-meter, layout B): a closed line naming the two nearest their limits, and on a tap thin bars for up to
// five. It reads the same rows as the Totals sheet (`lib/dayNutrientMeter.ts`), so food counts only where a limit counts food.
export default function DayVitMeter({ day }: { day: string }) {
  const supp = useAppStore(s => s.supp);
  const diet = useAppStore(s => s.diet);
  const profile = useAppStore(s => s.cfg.profile);
  const [open, setOpen] = useState(false);
  const m = dayNutrientMeter(totalsView(supp.items, supp.taken, day, 'taken', entriesOn(diet, day), profile));
  if (!m) return null;
  if (m.kind === 'none') return <p className="wb-fatnote nb-vit-none" id={`nb-vit-${day}`}>Vitamins and minerals: nothing ticked yet</p>;
  return (
    <div className="nb-vit" id={`nb-vit-${day}`}>
      <button type="button" className="nb-vit-tog" aria-expanded={open} aria-controls={`nb-vit-list-${day}`} onClick={() => setOpen(!open)}>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} />
        <span>Vitamins and minerals: {m.top.map((t, i) => <span key={t.key}>{i > 0 && ' · '}<b className={`nb-vit-${t.status}`}>{t.label} {t.status === 'over' ? 'over' : t.text}</b></span>)}</span>
      </button>
      {open && (
        <div className="nb-vit-list" id={`nb-vit-list-${day}`}>
          {m.subs.map(s => (
            <div key={s.key} className={`nb-vit-sub ${s.status}`}>
              <div className="wb-barl"><span>{s.label}</span><b className={`nb-vit-${s.status}`}>{s.text}</b></div>
              <div className={`wb-meter nb-vit-meter${s.status === 'over' ? ' over' : ''}`} role="img" aria-label={s.name}><i style={{ width: `${s.percent}%` }} /></div>
            </div>
          ))}
          <button type="button" className="nb-vit-all" onClick={() => useAppStore.getState().openModal({ type: 'nbsupptotals', day })}>{m.hidden > 0 ? `All ${m.tracked} in Totals` : 'Open Totals'}</button>
        </div>
      )}
    </div>
  );
}
