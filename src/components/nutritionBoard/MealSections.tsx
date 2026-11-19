import { useMemo, useState } from 'react';
import { dayStock } from '../../lib/boardStock.js';
import { mealFigures, mealKcalText, mealOverText, type EatenPlacement } from '../../lib/nutritionBoard.js';
import { drinkIdsOf } from '../../lib/recipeUses.js';
import { MARK_LABEL, SLOT_LABEL, type BoardDay, type BoardSlot } from '../../lib/weekBoard.js';
import { planItemKey } from '../../shared/diet.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { PlanSlot } from '../../types.ts';
import BoardCard from '../diet/board/BoardCard.js';
import type { Say } from '../../lib/eatenStep.js';
import { EatenRows } from './EatenRows.js';
import type { Resolved } from '../../lib/dietPlan.js';

const ORDER = ['breakfast', 'lunch', 'snack', 'dinner'] as const;
const SLOT_KEY = ['', ...ORDER];

// A day's meals (brief nutrition-board; header wording A, brief nutrition-board-available-list: "4 on the menu · 2 planned", then "245 kcal eaten" with a muted warning past the meal's share of a set target): Breakfast, Lunch, Snack and Dinner always (brief daily-snacks), with "Nothing planned" and no button when empty. Snack also lists the saved daily snacks (shown, not stored) and has the Daily snacks control; with no list it says "No daily snacks yet" and offers to set one up. Each meal shows its plate check and one-tap fixes; a planned item opens Less, More, Move to and Remove (today it also has a check box that logs it as eaten);
// drag moves it to another meal or day. Today's food that nobody planned sits in the meal for the hour it was logged, with an eaten mark; tapping it opens the row sheet (brief nutrition-items-row-sheet-and-more). An empty meal on a day ahead has an Add control (today logs eaten food, which has no meal) that opens the Add sheet on that day with that meal picked (brief nutrition-header-sheet-wording). Meals are the plan, so last week has none.
export default function MealSections({ view, placed, today, editable, onLog, onMsg, onAdd }: { view: BoardDay; placed: EatenPlacement['meals']; today: string; editable: boolean; onLog: (r: Resolved, index: number) => void; onMsg: Say; onAdd: (meal: PlanSlot) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const st = () => useAppStore.getState();
  const diet = useAppStore(x => x.diet);
  const snackList = useAppStore(x => x.cfg.diet?.snacks);
  const recipes = useAppStore(x => x.recipes);
  const grocery = useAppStore(x => x.grocery), groceryMonths = useAppStore(x => x.groceryMonths);
  const stock = useMemo(() => dayStock(view.day, today, view.slots.flatMap(s => s.items), diet, grocery, groceryMonths, recipes), [view, today, diet, grocery, groceryMonths, recipes]); // the day's at-home marks, once per change (lib/boardStock.ts)
  const hasSnacks = useAppStore(x => !!x.cfg.diet?.snacks?.length); // the saved daily snack list
  const slots: BoardSlot[] = [...view.slots];
  for (const s of ORDER) if (!slots.some(x => x.slot === s)) slots.push({ slot: s, items: [], kcal: 0, share: null, need: [], have: [], fixes: [] });
  slots.sort((a, b) => SLOT_KEY.indexOf(a.slot ?? '') - SLOT_KEY.indexOf(b.slot ?? ''));
  // A one-tap plate fix adds the food and marks it planned, as the check reads planned food only (brief nutrition-board-available-list).
  const addFix = (id: string, slot: PlanSlot) => {
    const err = st().addPlanItem(view.day, 'r', id, slot);
    if (err) { onMsg(err); return; }
    onMsg(st().setPlanned(view.day, (st().cfg.diet?.plan?.[view.day]?.length ?? 1) - 1, true) ?? '');
  };
  const drop = (e: React.DragEvent, slot: PlanSlot) => {
    e.preventDefault();
    try {
      const d = JSON.parse(e.dataTransfer.getData('text/plain')) as { day?: string; index?: number };
      if (d.day !== undefined && d.index !== undefined) onMsg(st().movePlanItem(d.day, d.index, view.day, slot) ?? '');
    } catch { /* not ours */ }
  };
  return (
    <>
      {slots.map(s => {
        const extra = (s.slot && placed[s.slot]) || [];
        const { planned, eatenKcal } = mealFigures(s.items, extra, diet, snackList, drinkIdsOf(recipes)); // lib/nutritionBoard.ts
        const over = s.slot ? mealOverText(s.share, eatenKcal, SLOT_LABEL[s.slot]) : null;
        return (
        <div key={s.slot ?? 'none'} className="wb-slot" onDragOver={e => { if (s.slot && editable) e.preventDefault(); }} onDrop={e => { if (s.slot && editable) drop(e, s.slot); }}>
          <div className="wb-slothd"><b>{s.slot ? SLOT_LABEL[s.slot] : 'Not set'}</b><span>{mealKcalText({ items: s.items.length, planned }, eatenKcal)}{over && <em className="wb-over"> · {over}</em>}</span></div>
          {s.items.length === 0 && extra.length === 0 && <span className="nb-empty">{s.slot === 'snack' && !hasSnacks ? 'No daily snacks yet' : 'Nothing planned'}</span>}
          {s.items.length === 0 && s.slot && view.day > today && <button type="button" className="btn sm nb-slotadd" aria-label={`Add to ${SLOT_LABEL[s.slot]}`} onClick={() => onAdd(s.slot!)}>Add</button>}
          {s.slot === 'snack' && editable && (hasSnacks
            ? <button type="button" className="btn sm ghost nb-slotadd" onClick={() => st().openModal({ type: 'nbsnacks' })}>Daily snacks</button>
            : <button type="button" className={`btn sm${view.day === today ? '' : ' ghost'} nb-slotadd`} onClick={() => st().openModal({ type: 'nbsnacks' })}>Set up daily snacks</button>)}
          {s.need.length > 0 && s.items.length > 0 && (
            <div className="wb-plate" role="group" aria-label={`${s.slot ? SLOT_LABEL[s.slot] : ''} plate check`}>
              {s.need.map(m => <span key={m} className={`wb-mk${s.have.includes(m) ? ' on' : ''}`}>{s.have.includes(m) ? '✓ ' : ''}{MARK_LABEL[m]}</span>)}
            </div>
          )}
          {s.items.map(x => {
            const ck = `${view.day}:${planItemKey(x.r.item)}`;
            return <BoardCard key={ck} item={x} day={view.day} today={today} open={open === ck} stock={stock.get(x.index)} onOpen={() => setOpen(open === ck ? null : ck)} onLog={onLog} onMsg={onMsg} />;
          })}
          <EatenRows label={`Eaten in ${s.slot ? SLOT_LABEL[s.slot] : 'this meal'}`} entries={extra} onMsg={onMsg} />
          {s.slot && editable && s.fixes.map(f => <button type="button" key={f.mark} className="wb-fix" onClick={() => addFix(f.recipe.id, s.slot!)}>+ Add {f.mark === 'carb' ? 'a carb' : f.mark === 'protein' ? 'a protein' : 'a veg'}: {f.recipe.n}{f.why ? ` (${f.why})` : ''}</button>)}
        </div>
        );
      })}
    </>
  );
}
