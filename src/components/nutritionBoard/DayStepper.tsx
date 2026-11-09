import { dayGroups, stepDay } from '../../lib/nutritionBoard.js';
import Icon from '../Icon.jsx';

// The phone's day control (brief nutrition-board): Previous, a dropdown grouped Last week, This week, Next week, and Next, like the Program tab's. Stepping crosses weeks and stops at the ends (seven days back, the end of next week).
export default function DayStepper({ today, day, onPick }: { today: string; day: string; onPick: (d: string) => void }) {
  const lo = stepDay(today, day, -1) === day, hi = stepDay(today, day, 1) === day;
  return (
    <div className="nb-step" role="group" aria-label="Day stepper">
      <button type="button" className="btn nb-stepbtn" aria-label="Previous day" aria-disabled={lo} onClick={() => { if (!lo) onPick(stepDay(today, day, -1)); }}><Icon name="chevron-left" /></button>
      <select className="btn nb-steppick" aria-label="Day to show" value={day} onChange={e => onPick(e.target.value)}>
        {dayGroups(today).map(g => <optgroup key={g.offset} label={g.label}>{g.days.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</optgroup>)}
      </select>
      <button type="button" className="btn nb-stepbtn" aria-label="Next day" aria-disabled={hi} onClick={() => { if (!hi) onPick(stepDay(today, day, 1)); }}><Icon name="chevron-right" /></button>
    </div>
  );
}
