import { useState } from 'react';
import { entriesOn } from '../../lib/dietLog.js';
import { totalsView } from '../../lib/supplementTotalsView.js';
import type { TotalsBasis } from '../../lib/supplementNutrients.js';
import { shortDay } from '../../lib/nutritionBoard.js';
import { useAppStore } from '../../store/useAppStore.js';
import Sheet from '../Sheet.js';
import './SupplementTotals.css';

// Vitamin and mineral totals (briefs supplement-nutrient-totals and food-vitamins-minerals): one bar per nutrient against its adult upper limit, from the supplements ticked on the day (or everything
// scheduled) and the foods eaten that day that list vitamins or minerals. Food is added only where the limit counts food. The numbers and words are `lib/supplementTotalsView.ts`; this only draws them.
export default function SupplementTotalsSheet({ day }: { day: string }) {
  const supp = useAppStore(s => s.supp);
  const diet = useAppStore(s => s.diet);
  const [basis, setBasis] = useState<TotalsBasis>('taken');
  const v = totalsView(supp.items, supp.taken, day, basis, entriesOn(diet, day));
  const first = supp.items.find(i => i.slot !== '');
  const st = () => useAppStore.getState();
  return (
    <Sheet className="nbsheet" aria-label="Vitamin and mineral totals">
      <h2 className="cond" id="stt-h">Vitamin and mineral totals</h2>
      <p className="note">{shortDay(day)}. Adds up what is in each supplement you listed and the foods you logged that list vitamins or minerals, against the upper limit for adults.</p>
      <div className="seg" role="group" aria-label="What to count">
        <button type="button" id="stt-taken" aria-pressed={basis === 'taken'} className={basis === 'taken' ? 'on' : ''} onClick={() => setBasis('taken')}>What I took</button>
        <button type="button" id="stt-sched" aria-pressed={basis === 'scheduled'} className={basis === 'scheduled' ? 'on' : ''} onClick={() => setBasis('scheduled')}>Everything scheduled</button>
      </div>
      {v.coverage && <p className="note" id="stt-coverage">{v.coverage}</p>}
      {!v.hasData && (
        <div className="stt-empty">
          <p>Add what is in a supplement, or log a food with a barcode scan or Find food, to see totals.</p>
          {first && <button type="button" className="btn" id="stt-first" onClick={() => st().openModal({ type: 'supplement', id: first.id })}>Add to {first.n}</button>}
        </div>
      )}
      {v.noneCounted && <p className="nb-empty" id="stt-none">Nothing ticked on this day yet.</p>}
      <ul className="stt-list">
        {v.rows.map(r => (
          <li key={r.key} className={`stt-row ${r.status}`} id={`stt-${r.key}`}>
            <div className="stt-hd"><b>{r.label}</b><span className="stt-fig">{r.figure}</span></div>
            <div className="stt-bar" role="img" aria-label={`${r.label}: ${r.figure}. ${r.statusText}. ${r.limitText}`}><i style={{ width: `${r.percent}%` }} /></div>
            <div className="stt-st"><b>{r.statusText}</b><span>{r.limitText}</span></div>
            {r.foodLine && <p className="note stt-food">{r.foodLine}</p>}
            <p className="note">From supplements: {r.products.length ? r.products.join(', ') : 'none'}</p>
            {r.notAdded.map(n => <p key={n} className="note">{n}</p>)}
            <p className="note">{r.recommendedText}</p>
            <p className="note">{r.scopeNote}</p>
          </li>
        ))}
      </ul>
      <p className="note stt-foot">Food counts only where the foods you logged list vitamins or minerals (a barcode scan or Find food); the rest add nothing, so a total can be low, and a total under a limit is not proof of safety. General information, not medical advice; your needs depend on age, sex and health.</p>
      <div className="actions"><button type="button" className="btn primary" id="stt-done" onClick={() => st().closeModal()}>Done</button></div>
    </Sheet>
  );
}
