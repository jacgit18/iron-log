import { useState } from 'react';
import { totalsView } from '../../lib/supplementTotalsView.js';
import type { TotalsBasis } from '../../lib/supplementNutrients.js';
import { shortDay } from '../../lib/nutritionBoard.js';
import { useAppStore } from '../../store/useAppStore.js';
import Sheet from '../Sheet.js';
import './SupplementTotals.css';

// Supplement totals (brief supplement-nutrient-totals): one bar per nutrient against its adult upper limit, from the supplements ticked on the day (or everything scheduled).
// Supplements only: food nutrients are not counted yet. The numbers and words are `lib/supplementTotalsView.ts`; this only draws them.
export default function SupplementTotalsSheet({ day }: { day: string }) {
  const supp = useAppStore(s => s.supp);
  const [basis, setBasis] = useState<TotalsBasis>('taken');
  const v = totalsView(supp.items, supp.taken, day, basis);
  const first = supp.items.find(i => i.slot !== '');
  const st = () => useAppStore.getState();
  return (
    <Sheet className="nbsheet" aria-label="Supplement totals">
      <h2 className="cond" id="stt-h">Supplement totals</h2>
      <p className="note">{shortDay(day)}. Adds up what is in each supplement you listed, against the upper limit for adults.</p>
      <div className="seg" role="group" aria-label="What to count">
        <button type="button" id="stt-taken" aria-pressed={basis === 'taken'} className={basis === 'taken' ? 'on' : ''} onClick={() => setBasis('taken')}>What I took</button>
        <button type="button" id="stt-sched" aria-pressed={basis === 'scheduled'} className={basis === 'scheduled' ? 'on' : ''} onClick={() => setBasis('scheduled')}>Everything scheduled</button>
      </div>
      {!v.hasData && (
        <div className="stt-empty">
          <p>Add what is in a supplement to see totals.</p>
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
            <p className="note">From: {r.products.length ? r.products.join(', ') : 'nothing added yet'}</p>
            {r.notAdded.map(n => <p key={n} className="note">{n}</p>)}
            <p className="note">{r.recommendedText}</p>
            <p className="note">{r.scopeNote}</p>
          </li>
        ))}
      </ul>
      <p className="note stt-foot">Supplements only: food is not counted, so a total under a limit is not proof of safety, and some limits count food too. General information, not medical advice; your needs depend on age, sex and health.</p>
      <div className="actions"><button type="button" className="btn primary" id="stt-done" onClick={() => st().closeModal()}>Done</button></div>
    </Sheet>
  );
}
