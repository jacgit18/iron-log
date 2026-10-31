import { useEffect, useRef, useState } from 'react';
import { FRACTIONS, UNITS, composeAmount, parseAmount, stepWhole, type AmountParts } from '../../lib/amountPicker.js';
import { MAX_AMOUNT } from '../../shared/recipes.js';

// The amount picker under an ingredient row (brief recipe-form-mobile-desktop): a number stepper, fraction and unit chips, the amounts used
// last, and a line to type anything else. It writes only on Done, and only when something was changed, so opening an old amount and closing it
// never rewrites it. The rules are in src/lib/amountPicker.ts.
export default function AmountPicker({ value, name, recents, onDone, onClose }: { value: string; name: string; recents: string[]; onDone: (text: string) => void; onClose: () => void }) {
  const [start] = useState(() => parseAmount(value));
  const [parts, setParts] = useState<AmountParts>(start.parts);
  const [free, setFree] = useState<string | null>(start.exact ? null : value); // text the chips cannot write: kept until a chip is tapped
  const [dirty, setDirty] = useState(!value.trim()); // an empty amount opened at 1: Done writes it
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { panel.current?.focus(); }, []);
  const text = free ?? composeAmount(parts);
  const pick = (p: Partial<AmountParts>) => { setParts({ ...parts, ...p }); setFree(null); setDirty(true); };
  const done = () => (dirty ? onDone(text) : onClose());
  return (
    <div className="rc-picker" role="group" aria-label={`Amount for ${name || 'ingredient'}`} tabIndex={-1} ref={panel} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <p className="rc-pickprev">Amount <output>{text || 'None'}</output></p>
      <div className="rc-pickrow">
        <div>
          <span className="rc-picklab">Whole number</span>
          <div className="rc-step">
            <button type="button" className="btn" aria-label="Fewer" disabled={parts.whole === 0} onClick={() => pick({ whole: stepWhole(parts.whole, -1) })}>−</button>
            <output aria-label="Whole number">{parts.whole}</output>
            <button type="button" className="btn" aria-label="More" onClick={() => pick({ whole: stepWhole(parts.whole, 1) })}>+</button>
          </div>
        </div>
        <div>
          <span className="rc-picklab">Fraction</span>
          <div className="rc-chips2" role="group" aria-label="Fraction">
            {FRACTIONS.map(f => <button key={f} type="button" className={`btn${free === null && parts.frac === f ? ' primary' : ''}`} aria-pressed={free === null && parts.frac === f} onClick={() => pick({ frac: f })}>{f || 'None'}</button>)}
          </div>
        </div>
      </div>
      <div>
        <span className="rc-picklab">Unit</span>
        <div className="rc-chips2" role="group" aria-label="Unit">
          {UNITS.map(u => <button key={u} type="button" className={`btn${free === null && parts.unit === u ? ' primary' : ''}`} aria-pressed={free === null && parts.unit === u} onClick={() => pick({ unit: parts.unit === u ? '' : u })}>{u}</button>)}
        </div>
      </div>
      {recents.length > 0 && (
        <div>
          <span className="rc-picklab">Recent</span>
          <div className="rc-chips2" role="group" aria-label="Recent amounts">
            {recents.map(r => <button key={r} type="button" className="btn" onClick={() => onDone(r)}>{r}</button>)}
          </div>
        </div>
      )}
      <div className="rc-pickacts">
        <input aria-label="Type an amount instead" placeholder="Or type: to taste" maxLength={MAX_AMOUNT} autoComplete="off" value={free ?? ''} onChange={e => { setFree(e.target.value || null); setDirty(true); }} />
        <button type="button" className="btn" onClick={() => onDone('')}>Clear</button>
        <button type="button" className="btn primary" onClick={done}>Done</button>
      </div>
    </div>
  );
}
