import { fmtNum } from '../../../lib/dietLog.js';
import type { BoardDay } from '../../../lib/weekBoard.js';
import type { Targets } from '../../../lib/dietTarget.js';

// The three bars at the top of a day (brief week-board): calories, protein and fat against your targets, each labelled in words so colour is never the only cue. A bar turns rust red when over.
// The fat bar says how complete it is: whole, hatched with "n of m foods", or replaced by a prompt when most foods have no fat figure.
function Bar({ cls, label, value, target, unit, over }: { cls: string; label: string; value: number; target: number | null; unit: string; over: boolean }) {
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div className="wb-bar">
      <div className="wb-barl"><span>{label}</span><b>{fmtNum(value)}{target ? ` / ${fmtNum(target)}` : ''} {unit}</b></div>
      <div className={`wb-meter ${cls}${over ? ' over' : ''}`} role="meter" aria-label={`${label} planned`} aria-valuemin={0} aria-valuemax={target ?? Math.max(value, 1)} aria-valuenow={value} aria-valuetext={`${fmtNum(value)}${target ? ` of ${fmtNum(target)}` : ''} ${unit}`}><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export default function DayBars({ day, targets }: { day: BoardDay; targets: Targets }) {
  const { kcal, protein, fat } = targets;
  return (
    <div className="wb-bars">
      <Bar cls="kcal" label="Calories" value={day.kcal} target={kcal} unit="kcal" over={!!kcal && day.kcal > kcal} />
      <Bar cls="prot" label="Protein" value={day.protein} target={protein} unit="g" over={!!protein && day.protein > protein} />
      {day.fatState === 'hidden' ? (
        <p className="wb-fatnote">Add fat to your foods to see fat here.</p>
      ) : (
        <>
          <Bar cls={day.fatState === 'partial' ? 'fat part' : 'fat'} label="Fat" value={day.fat} target={fat} unit="g" over={day.fatState === 'full' && !!fat && day.fat > fat} />
          {day.fatState === 'partial' && <p className="wb-fatnote">Fat: {day.fatFoods.known} of {day.fatFoods.all} foods have it.</p>}
        </>
      )}
    </div>
  );
}
