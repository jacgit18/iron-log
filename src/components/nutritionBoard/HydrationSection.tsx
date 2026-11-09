import { hydrationView, shortDay } from '../../lib/nutritionBoard.js';
import { useAppStore } from '../../store/useAppStore.js';

// A day's Hydration (brief nutrition-board): the goal left to drink or "Goal met", the reason tags (hot day, training) and + Drink, which opens the drink sheet. A day ahead says "Goal n oz" until something is logged.
export default function HydrationSection({ day, today }: { day: string; today: string }) {
  const supp = useAppStore(s => s.supp);
  const body = useAppStore(s => s.body);
  const h = hydrationView(day, today, supp, body);
  return (
    <div className="wb-slot nb-hydration" role="group" aria-labelledby={`nb-hyd-h-${day}`}>
      <div className="wb-slothd"><b id={`nb-hyd-h-${day}`}>Hydration</b></div>
      <span className="nb-hstatus">{h.status}</span>
      {h.tags.length > 0 && <div className="nb-tags">{h.tags.map(t => <span key={t} className="nb-tag">{t}</span>)}</div>}
      <button type="button" className="wb-add nb-drink" aria-label={`+ Drink on ${shortDay(day)}`} onClick={() => useAppStore.getState().openModal({ type: 'nbdrink', day })}>+ Drink</button>
    </div>
  );
}
