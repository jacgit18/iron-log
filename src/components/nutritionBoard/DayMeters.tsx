import { meterLabel, type DayView } from '../../lib/nutritionBoard.js';

// The four meters at the top of a day (brief nutrition-board): calories, protein, fat and water, each in words so colour is never the only cue. Eaten food for last week and today, the plan for days ahead; a bar past its target stays full and turns rust red.
export default function DayMeters({ v }: { v: DayView }) {
  return (
    <div className="wb-bars nb-meters">
      {v.meters.map(m => {
        if (m.hidden) return <p key={m.key} className="wb-fatnote">{m.note}</p>;
        const pct = m.target ? Math.min(100, Math.round((m.value / m.target) * 100)) : 0;
        return (
          <div key={m.key} className="wb-bar">
            <div className="wb-barl"><span>{m.label}</span><b>{m.text}</b></div>
            <div className={`wb-meter nb-${m.key}${m.key === 'fat' && m.note ? ' part' : ''}${m.over ? ' over' : ''}`} role="img" aria-label={meterLabel(m, v.basis, v.kind)}><i style={{ width: `${pct}%` }} /></div>
            {m.note && <p className="wb-fatnote">{m.note}</p>}
          </div>
        );
      })}
    </div>
  );
}
