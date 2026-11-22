import { useId, useState } from 'react';
import { cardStock, type CardStock, type StockContext } from '../../lib/boardStock.js';
import { parseTrayOpen, trayOpenWith, TRAY_OPEN_KEY, type TrayRow } from '../../lib/availableTray.js';
import { tickWord, type Say } from '../../lib/eatenStep.js';
import { NEED_TO_BUY, isNeedFood, tickHeld } from '../../lib/haveOnly.js';
import { macroLine } from '../../lib/macroLine.js';
import type { Resolved } from '../../lib/dietPlan.js';
import { SLOT_LABEL } from '../../lib/weekBoard.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { PlanSlot } from '../../types.ts';
import BoardCard from '../diet/board/BoardCard.js';
import Icon from '../Icon.js';
import NeedFlag from './NeedFlag.js';
import './AvailableTray.css';

const readOpen = (slot: PlanSlot): boolean => { try { return !!parseTrayOpen(localStorage.getItem(TRAY_OPEN_KEY))[slot]; } catch { return false; } }; // a private window or blocked storage reads as closed
const writeOpen = (slot: PlanSlot, open: boolean) => { try { localStorage.setItem(TRAY_OPEN_KEY, trayOpenWith(localStorage.getItem(TRAY_OPEN_KEY), slot, open)); } catch { /* not remembered: still works */ } };

// A meal's Available tray (brief nutrition-planned-available-tray, ADR 146; it was the Keep handy tray, brief nutrition-keep-handy): everything in the meal that is not planned and not eaten, plus the foods kept handy for it, in one list. One button line "Available · 6" opens it (closed by default; each meal's choice is remembered in this browser). A row of a stored or shown item is a card with Ate and Plan (BoardCard `variant="tray"`); a handy row (tagged "handy") has Ate, Plan (this day only) and Change, and is stored by whichever it is used for (`realizeRepeat`). `rows` are worked out once per meal by MealSections (`trayRows`). Nothing shows when the meal has none.
export default function AvailableTray({ day, slot, rows, today, ctx, stock, onLog, onMsg }: {
  day: string; slot: PlanSlot; rows: readonly TrayRow[]; today: string; ctx: StockContext | null; stock: (index: number) => CardStock | undefined;
  onLog: (r: Resolved, index: number) => void; onMsg: Say;
}) {
  const [open, setOpen] = useState(() => readOpen(slot));
  const [card, setCard] = useState<string | null>(null); // the row whose actions are open
  const listId = useId();
  if (!rows.length) return null;
  const meal = SLOT_LABEL[slot], toggle = () => { writeOpen(slot, !open); setOpen(!open); };
  return (
    <div className="hy-tray">
      <button type="button" className="hy-head" aria-expanded={open} aria-controls={listId} aria-label={`Available · ${rows.length} for ${meal}`} onClick={toggle}>
        <span>Available · {rows.length}</span><Icon name={open ? 'chevron-up' : 'chevron-down'} />
      </button>
      {open && (
        <ul id={listId} className="hy-list" aria-label={`Available foods for ${meal}`}>
          {rows.map(row => (
            <li key={row.key} className="hy-row">
              {row.item
                ? <div className="hy-card"><BoardCard item={row.item} day={day} today={today} open={card === row.key} stock={stock(row.item.index)} variant="tray" onOpen={() => setCard(card === row.key ? null : row.key)} onLog={onLog} onMsg={onMsg} /></div>
                : <HandyRowView row={row} day={day} today={today} meal={meal} ctx={ctx} onLog={onLog} onMsg={onMsg} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HandyRowView({ row, day, today, meal, ctx, onLog, onMsg }: { row: TrayRow; day: string; today: string; meal: string; ctx: StockContext | null; onLog: (r: Resolved, index: number) => void; onMsg: Say }) {
  const st = () => useAppStore.getState();
  const res = row.r, rid = row.rid!;
  const handyItem = useAppStore(s => s.cfg.diet?.repeats?.find(x => x.rid === rid));
  const mark = ctx ? cardStock(res, false, ctx) : null, needFood = isNeedFood(res.recipe, mark?.kind), held = tickHeld(needFood, false);
  const ate = () => {
    const at = st().realizeRepeat(day, rid);
    if (typeof at === 'string') { onMsg(at); return; }
    onLog(res, at);
    st().unstoreRepeat(day, at, rid); // a log that failed leaves nothing stored: it only goes back to the tray (no-op once it has an eaten mark)
  };
  const plan = () => { const r = st().planRow(day, { rid }, false); if (r.message) onMsg(r.message); }; // a handy food is planned for this day only; a full day answers and the food stays here
  return (
    <>
      <span className="hy-name"><b>{row.name}{row.portion !== 1 ? ` ×${row.portion}` : ''}<span className="hy-tag">handy</span>{needFood && <span className="wb-stock shopping">{NEED_TO_BUY}</span>}</b>{macroLine(res) && <small>{macroLine(res)}</small>}</span>
      {handyItem && <button type="button" className="btn sm ghost" aria-label={`Change ${row.name}`} aria-haspopup="dialog" onClick={() => st().openModal({ type: 'nbrepeat', day, name: row.name, item: { k: handyItem.k, id: handyItem.id, ...(handyItem.x ? { x: handyItem.x } : {}), ...(handyItem.s ? { s: handyItem.s } : {}) }, rp: rid, onMsg })}>Change</button>}
      {day === today && <button type="button" className="btn sm" aria-label={`${tickWord(false)} ${row.name}`} disabled={held} onClick={ate}>{tickWord(false)}</button>}
      {day >= today && <button type="button" className="btn sm" aria-label={`Plan ${row.name} for ${meal}`} onClick={plan}>Plan</button>}
      {needFood && res.recipe && <NeedFlag recipe={res.recipe} today={today} />}
    </>
  );
}
