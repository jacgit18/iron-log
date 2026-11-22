import './AvailableTray.css';

// The question Plan asks when the food has a future copy (brief nutrition-planned-available-tray, owner 2026-11-22): this day only, or this day and every future day it appears. An inline group under the card or tray row, so it works as a phone sheet too; Cancel changes nothing.
export default function PlanAsk({ name, onOne, onForward, onCancel }: { name: string; onOne: () => void; onForward: () => void; onCancel: () => void }) {
  return (
    <div className="pa-ask" role="group" aria-label={`Plan ${name}`}>
      <p className="pa-q">Plan {name} for</p>
      <button type="button" className="btn sm" onClick={onOne}>This day only</button>
      <button type="button" className="btn sm" onClick={onForward}>This day and every future day it appears</button>
      <button type="button" className="btn sm ghost" onClick={onCancel}>Cancel</button>
    </div>
  );
}
