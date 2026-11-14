import { useId, useState } from 'react';
import { fmtAmount, type BreakdownRow, type Breakdown, type Segment } from '../../lib/mealMicroBreakdown.js';
import './MealMicroBars.css';

// Written out in full so the stylesheet check (`recipesCssUsed.test.ts`) finds every class in the source.
const SLOT_CLASS: Record<string, string> = { 1: 'mmb-s1', 2: 'mmb-s2', 3: 'mmb-s3', 4: 'mmb-s4', 5: 'mmb-s5', other: 'mmb-sother' };
const slotClass = (slot: Segment['slot']) => SLOT_CLASS[String(slot)] ?? 'mmb-sother';

/** What a screen reader hears for one bar: each food's amount, the ones that do not list it, and the total. */
function rowLabel(r: BreakdownRow): string {
  const parts = r.segments.map(s => (s.amount === null ? `${s.name} not listed` : `${s.name} ${fmtAmount(s.amount)} ${r.unit}`));
  return `${r.label} per serving: ${parts.join(', ')}. Total ${r.atLeast ? 'at least ' : ''}${fmtAmount(r.total)} ${r.unit}.`;
}

// A meal's vitamins and minerals, one bar per nutrient split by food (brief meal-micro-breakdown). Collapsed to one line until opened; the numbers come from `mealMicroBreakdown`.
export default function MealMicroBars({ breakdown }: { breakdown: Breakdown }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const count = breakdown.rows.length;
  const anyAtLeast = breakdown.rows.some(r => r.atLeast);
  return (
    <section className="mmb" aria-label="Vitamins and minerals">
      <button type="button" className="btn sm mmb-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(o => !o)}>
        {open ? 'Hide vitamins and minerals' : `Vitamins and minerals: ${count} listed`}
      </button>
      {open && (
        <div id={panelId} className="mmb-panel">
          <ul className="mmb-legend" aria-label="Foods">
            {breakdown.legend.map(l => <li key={String(l.slot)}><span className={`mmb-dot ${slotClass(l.slot)}`} aria-hidden="true" />{l.name}</li>)}
          </ul>
          <ul className="mmb-rows">
            {breakdown.rows.map(r => (
              <li className="mmb-row" key={r.key}>
                <div className="mmb-top">
                  <strong>{r.label}</strong>
                  <span className="mmb-val">{r.atLeast ? '≥ ' : ''}{fmtAmount(r.total)} {r.unit}{r.atLeast && <span className="mmb-flag">at least</span>}</span>
                </div>
                <div className="mmb-track" role="img" aria-label={rowLabel(r)}>
                  {r.segments.map(s => s.amount === null
                    ? <div key={String(s.slot)} className="mmb-seg mmb-unk" title={`${s.missing.join(', ')} does not list this`}>not listed</div>
                    : <div key={String(s.slot)} className={`mmb-seg ${slotClass(s.slot)}`} title={`${s.name}: ${fmtAmount(s.amount)} ${r.unit} per serving`} style={{ flexGrow: s.amount }}>{fmtAmount(s.amount)}</div>)}
                </div>
              </li>
            ))}
          </ul>
          <p className="note">Numbers are per serving. Each bar shows every food’s share of that nutrient.</p>
          {anyAtLeast && <p className="note mmb-warn">At least: a food does not list that nutrient, so the real total could be higher.</p>}
        </div>
      )}
    </section>
  );
}
