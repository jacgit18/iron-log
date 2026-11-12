import type { SupplementServing, SupplementSlot } from '../../types.ts';
import { SLOTS, slotLabel } from '../../lib/supplements.js';
import { formWord, portionText, unitsOf } from '../../lib/supplementPortion.js';
import { dayTotal, stepTime, toggleTime } from '../../lib/supplementTimes.js';
import type { TimeChoice } from '../../lib/supplementTimes.js';
import Icon from '../Icon.js';
import '../Pill.css';
import './SupplementTimes.css';

// "When you take it" on the supplement sheet (brief supplement-split-times): a chip per time of day, an amount stepper under each time that is on, and the total a day.
// The sheet owns `times`; Save turns it into entries (store `saveSupplementTimes`). `serving` is the serving size typed further down the sheet.
interface Props { times: TimeChoice[]; serving: SupplementServing | undefined; onChange: (t: TimeChoice[]) => void }

export default function SupplementTimes({ times, serving, onChange }: Props) {
  const units = unitsOf(serving); const word = serving ? `${formWord(serving)}s` : 'servings';
  const total = dayTotal(times, serving);
  return (
    <div className="stimes">
      <div className="stimes-chips" role="group" aria-label="Times of day">
        {SLOTS.map(([k, l]) => { const on = times.some(t => t.slot === k); return (
          <button key={k} type="button" className="pillbtn" id={`stimes-chip-${k}`} aria-pressed={on} onClick={() => onChange(toggleTime(times, k as SupplementSlot))}>{l}</button>
        ); })}
      </div>
      {times.map(t => (
        <div key={t.slot} className="stimes-row" role="group" aria-label={`${slotLabel(t.slot)} amount`}>
          <span className="stimes-name">{slotLabel(t.slot)}</span>
          <button type="button" className="btn pstep-btn" id={`stimes-less-${t.slot}`} aria-label={`Fewer ${word}, ${slotLabel(t.slot)}`} onClick={() => onChange(stepTime(times, t.slot, -1, units))}><Icon name="minus" /></button>
          <output className="pstep-val" id={`stimes-val-${t.slot}`} aria-live="polite">{portionText(t.portion, serving)}</output>
          <button type="button" className="btn pstep-btn" id={`stimes-more-${t.slot}`} aria-label={`More ${word}, ${slotLabel(t.slot)}`} onClick={() => onChange(stepTime(times, t.slot, 1, units))}><Icon name="plus" /></button>
        </div>
      ))}
      <p className="pstep-sum" id="stimes-total">
        {total.main ? <><b className="pstep-main">{total.main}</b><br />{total.detail}</> : 'Library only. Tap a time to put it on your schedule.'}
      </p>
    </div>
  );
}
