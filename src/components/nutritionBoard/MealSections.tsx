import { useState } from 'react';
import { MARK_LABEL, SLOT_LABEL, type BoardDay, type BoardSlot } from '../../lib/weekBoard.js';
import { planItemKey } from '../../shared/diet.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { PlanSlot } from '../../types.ts';
import BoardCard from '../diet/board/BoardCard.js';
import type { Resolved } from '../../lib/dietPlan.js';

const ORDER = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const SLOT_KEY = ['', ...ORDER];

// A day's meals (brief nutrition-board): Breakfast, Lunch and Dinner always, with "Nothing planned" and no button when empty; Snack only when it holds something. Each meal shows its plate check and one-tap fixes; a planned item opens Less, More, Move to and Remove (today it also has a check box that logs it as eaten);
// drag moves it to another meal or day. An empty meal on a day ahead has an Add control (today logs eaten food, which has no meal) that opens the Add sheet on that day with that meal picked (brief nutrition-header-sheet-wording). Meals are the plan, so last week has none.
export default function MealSections({ view, today, days, editable, onLog, onMsg, onAdd }: { view: BoardDay; today: string; days: { id: string; label: string }[]; editable: boolean; onLog: (r: Resolved, index: number) => void; onMsg: (t: string) => void; onAdd: (meal: PlanSlot) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const st = () => useAppStore.getState();
  const slots: BoardSlot[] = [...view.slots];
  for (const s of ORDER) if (!slots.some(x => x.slot === s)) slots.push({ slot: s, items: [], kcal: 0, share: null, need: [], have: [], fixes: [] });
  slots.sort((a, b) => SLOT_KEY.indexOf(a.slot ?? '') - SLOT_KEY.indexOf(b.slot ?? ''));
  const drop = (e: React.DragEvent, slot: PlanSlot) => {
    e.preventDefault();
    try {
      const d = JSON.parse(e.dataTransfer.getData('text/plain')) as { day?: string; index?: number };
      if (d.day !== undefined && d.index !== undefined) onMsg(st().movePlanItem(d.day, d.index, view.day, slot) ?? '');
    } catch { /* not ours */ }
  };
  return (
    <>
      {slots.filter(s => s.slot !== 'snack' || s.items.length > 0).map(s => (
        <div key={s.slot ?? 'none'} className="wb-slot" onDragOver={e => { if (s.slot && editable) e.preventDefault(); }} onDrop={e => { if (s.slot && editable) drop(e, s.slot); }}>
          <div className="wb-slothd"><b>{s.slot ? SLOT_LABEL[s.slot] : 'Not set'}</b><span>{s.items.length ? `${s.kcal.toLocaleString('en-US')}${s.share ? ` / ${s.share.toLocaleString('en-US')}` : ''} kcal` : ''}</span></div>
          {s.items.length === 0 && <span className="nb-empty">Nothing planned</span>}
          {s.items.length === 0 && s.slot && view.day > today && <button type="button" className="btn sm nb-slotadd" aria-label={`Add to ${SLOT_LABEL[s.slot]}`} onClick={() => onAdd(s.slot!)}>Add</button>}
          {s.need.length > 0 && s.items.length > 0 && (
            <div className="wb-plate" role="group" aria-label={`${s.slot ? SLOT_LABEL[s.slot] : ''} plate check`}>
              {s.need.map(m => <span key={m} className={`wb-mk${s.have.includes(m) ? ' on' : ''}`}>{s.have.includes(m) ? '✓ ' : ''}{MARK_LABEL[m]}</span>)}
            </div>
          )}
          {s.items.map(x => {
            const ck = `${view.day}:${planItemKey(x.r.item)}`;
            return <BoardCard key={ck} item={x} day={view.day} today={today} days={days} open={open === ck} moving={moving === ck} onOpen={() => { setOpen(open === ck ? null : ck); setMoving(null); }} onMoveOpen={() => setMoving(moving === ck ? null : ck)} onLog={onLog} onMsg={onMsg} />;
          })}
          {s.slot && editable && s.fixes.map(f => <button type="button" key={f.mark} className="wb-fix" onClick={() => onMsg(st().addPlanItem(view.day, 'r', f.recipe.id, s.slot!) ?? '')}>+ Add {f.mark === 'carb' ? 'a carb' : f.mark === 'protein' ? 'a protein' : 'a veg'}: {f.recipe.n}{f.why ? ` (${f.why})` : ''}</button>)}
        </div>
      ))}
    </>
  );
}
