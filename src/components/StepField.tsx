import type { ReactNode } from 'react';
import { STEP_CHIPS, STEP_ERR, parseStep } from '../lib/weightStep.js';
import './StepField.css';

// How much the suggested weight goes up by, for one exercise: three common steps as chips (tap the lit one again to clear it), or any number typed.
// Empty means the default; `placeholder` says what that is.
export default function StepField({ value, onChange, placeholder, children }: { value: string; onChange: (text: string) => void; placeholder: string; children?: ReactNode }) {
  const p = parseStep(value); const cur = p.ok ? p.step : null;
  return (
    <div className="field stepfield" role="group" aria-label="Weight step (lb)">
      <span>Weight step (lb)</span>
      <div className="stepchips">
        {STEP_CHIPS.map(n => (
          <button key={n} type="button" className="btn" aria-pressed={cur === n} onClick={() => onChange(cur === n ? '' : String(n))}>{n}</button>
        ))}
      </div>
      <input type="text" inputMode="decimal" autoComplete="off" aria-label="Weight step in lb, typed" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      {!p.ok && <span className="note err" role="alert">{STEP_ERR}</span>}
      {children}
    </div>
  );
}
