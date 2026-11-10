import { FORM_WORDS, formWord, milligramLines, portionText, stepPortion, unitsOf } from '../../lib/supplementPortion.js';
import './PortionStepper.css';

// "How much you take each time" on the supplement sheet (brief supplement-portions): capsules (or tablets) in one label serving, then a stepper that moves one capsule per tap, with the amount that comes to under it.
// The nutrient rows are per serving; the portion is stored in servings, so this shows capsules only while the serving size is known. `row` is the first nutrient row typed above it.
export interface PortionRow { label: string; amount: number; unit: string }
interface Props { portion: number; units: string; form: string; row?: PortionRow; onPortion: (n: number) => void; onUnits: (s: string) => void; onForm: (s: string) => void; /** The sheet's time chips hold the amounts, so only the serving size is asked here. */ sizeOnly?: boolean }

export default function PortionStepper({ portion, units, form, row, onPortion, onUnits, onForm, sizeOnly }: Props) {
  const serving = Number(units) > 0 ? { units: Number(units), form } : undefined;
  const n = unitsOf(serving);
  const word = serving ? formWord(serving) : 'serving';
  const lines = milligramLines(row, row?.label.toLowerCase() ?? '', portion, serving);
  return (
    <fieldset className="pstep">
      <legend>{sizeOnly ? 'What one serving is' : 'How much you take each time'}</legend>
      <div className="pstep-size">
        <label className="field">Capsules or tablets in one serving (optional)
          <input id="supp-serving-units" type="number" inputMode="decimal" min="0" max="100" step="any" value={units} placeholder="e.g. 2" onChange={e => onUnits(e.target.value)} />
        </label>
        <label className="field">What it is
          <select id="supp-serving-form" value={formWord(serving)} onChange={e => onForm(e.target.value)}>
            {(FORM_WORDS.some(w => w === formWord(serving)) ? [...FORM_WORDS] : [...FORM_WORDS, formWord(serving)]).map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>
      </div>
      <p className="note">{n ? `The label serving is ${portionText(1, serving)}.` : 'Add how many capsules make one serving to count capsules; until then this counts servings.'}</p>
      {!sizeOnly && <div className="pstep-row" role="group" aria-label={serving ? `${word}s I take each time` : 'Servings I take each time'}>
        <button type="button" className="btn pstep-btn" id="supp-portion-less" aria-label={`Fewer ${serving ? `${word}s` : 'servings'}`} onClick={() => onPortion(stepPortion(portion, -1, n))}>−</button>
        <output id="supp-portion-value" className="pstep-val" aria-live="polite">{portionText(portion, serving)}</output>
        <button type="button" className="btn pstep-btn" id="supp-portion-more" aria-label={`More ${serving ? `${word}s` : 'servings'}`} onClick={() => onPortion(stepPortion(portion, 1, n))}>+</button>
      </div>}
      {!sizeOnly && <p className="pstep-sum" id="supp-portion-sum">
        {lines.main && <b className="pstep-main">{lines.main}</b>}
        {lines.main && <br />}
        {lines.detail}
      </p>}
    </fieldset>
  );
}
