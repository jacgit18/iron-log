import { togglePlateMark } from '../../lib/plate.js';
import type { PlateMark } from '../../types.ts';
import './UsedAsChips.css';

const LABEL: Record<PlateMark, string> = { protein: 'Protein', carb: 'Carb', veg: 'Veg' };

// What a recipe covers on a plate (brief week-board): Protein, Carb and Veg chips that start on what the category and numbers say. Pressing one is the person's own choice;
// "Back to automatic" returns to the derived marks. Same chip look as Used as.
export default function CountsAsChips({ value, picked, onChange, onAuto }: { value: readonly PlateMark[]; picked: boolean; onChange: (next: PlateMark[]) => void; onAuto: () => void }) {
  return (
    <div role="group" aria-label="Counts as" className="rc-usedas">
      <span className="rc-usedlabel" aria-hidden="true">Counts as on a plate</span>
      <div className="rc-usedchips">
        {(['protein', 'carb', 'veg'] as const).map(m => <button type="button" key={m} aria-pressed={value.includes(m)} onClick={() => onChange(togglePlateMark(value, m))}>{LABEL[m]}</button>)}
        {picked && <button type="button" className="rc-usedauto" onClick={onAuto}>Back to automatic</button>}
      </div>
    </div>
  );
}
