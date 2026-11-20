import { useId, useMemo, useState } from 'react';
import { handyTrays } from '../../lib/repeats.js';
import { SLOT_LABEL } from '../../lib/weekBoard.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { PlanSlot } from '../../types.ts';
import type { Say } from '../../lib/eatenStep.js';
import Icon from '../Icon.js';
import './HandyTray.css';

// A meal's Keep handy tray (brief nutrition-keep-handy): the foods kept handy for this meal, out of the day's card and totals. One button line "Handy · 6" opens the list (collapsed by default, not remembered); each row has + Add, which stores the food in this meal on this day only (realizeRepeat) and takes it out of this day's tray, and Change, which opens the Repeat sheet for it. Nothing shows when the meal has no handy foods.
export default function HandyTray({ day, slot, today, onMsg }: { day: string; slot: PlanSlot; today: string; onMsg: Say }) {
  const repeats = useAppStore(s => s.cfg.diet?.repeats), skips = useAppStore(s => s.cfg.diet?.repeatSkips), plan = useAppStore(s => s.cfg.diet?.plan);
  const recipes = useAppStore(s => s.recipes), meals = useAppStore(s => s.cfg.diet?.meals), moved = useAppStore(s => s.cfg.diet?.mealsMoved);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rows = useMemo(() => handyTrays(day, plan ?? {}, repeats, skips, today, recipes, meals ?? [], moved)[slot] ?? [], [day, plan, repeats, skips, today, recipes, meals, moved, slot]);
  if (!rows.length) return null;
  const st = () => useAppStore.getState(), meal = SLOT_LABEL[slot];
  const add = (rid: string) => { const r = st().realizeRepeat(day, rid); if (typeof r === 'string') onMsg(r); };
  return (
    <div className="hy-tray">
      <button type="button" className="hy-head" aria-expanded={open} aria-controls={listId} aria-label={`Handy · ${rows.length} for ${meal}`} onClick={() => setOpen(!open)}>
        <span>Handy · {rows.length}</span><Icon name={open ? 'chevron-up' : 'chevron-down'} />
      </button>
      {open && (
        <ul id={listId} className="hy-list" aria-label={`Handy foods for ${meal}`}>
          {rows.map(({ r, res }) => (
            <li key={r.rid} className="hy-row">
              <span className="hy-name"><b>{res.name}{res.portion !== 1 ? ` ×${res.portion}` : ''}</b>{res.kcal !== undefined && <small>{Math.round(res.kcal)} kcal{res.p !== undefined ? ` · ${Math.round(res.p)} g protein` : ''}</small>}</span>
              <button type="button" className="btn sm ghost" aria-label={`Change ${res.name}`} aria-haspopup="dialog" onClick={() => st().openModal({ type: 'nbrepeat', day, name: res.name, item: { k: r.k, id: r.id, ...(r.x ? { x: r.x } : {}), ...(r.s ? { s: r.s } : {}) }, rp: r.rid, onMsg })}>Change</button>
              <button type="button" className="btn sm hy-add" aria-label={`+ Add ${res.name} to ${meal}`} onClick={() => add(r.rid)}>+ Add</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
