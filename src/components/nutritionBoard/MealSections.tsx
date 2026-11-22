import { useMemo, useState } from 'react';
import { splitMeal, trayRows } from '../../lib/availableTray.js';
import { dayStock, stockContext } from '../../lib/boardStock.js';
import { mealAddShown, mealFigures, mealKcalText, shortDay, slotOverText, type EatenPlacement } from '../../lib/nutritionBoard.js';
import { drinkIdsOf } from '../../lib/recipeUses.js';
import { handyTrays } from '../../lib/repeats.js';
import { MARK_LABEL, SLOT_LABEL, type BoardDay, type BoardSlot } from '../../lib/weekBoard.js';
import { PLAN_SLOTS, planItemKey } from '../../shared/diet.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { PlanSlot } from '../../types.ts';
import BoardCard from '../diet/board/BoardCard.js';
import type { Say } from '../../lib/eatenStep.js';
import Icon from '../Icon.js';
import { EatenRows } from './EatenRows.js';
import AvailableTray from './AvailableTray.js';
import './PlateHints.css';
import type { Resolved } from '../../lib/dietPlan.js';

const ORDER = PLAN_SLOTS;
const SLOT_KEY = ['', ...ORDER];

// A day's meals (brief nutrition-board; header wording of brief nutrition-planned-available-tray: "2 planned · 5 available", then "245 kcal eaten" first once something is eaten, with a muted warning past the meal's share of a set target): Breakfast, Lunch, Dinner and Snack always (brief daily-snacks), with "Nothing planned for Lunch." when the plate is empty. The plate holds what is planned or eaten; everything else, and the foods kept handy, waits in the meal's closed Available tray (AvailableTray). Snack also lists the saved daily snacks (shown, not stored) and has the Daily snacks control; with no list it says "No daily snacks yet" and offers to set one up. Each meal shows its plate check and one-tap fixes; a planned item opens Less, More, Move to and Remove (today it also has a check box that logs it as eaten);
// drag moves it to another meal or day. Today's food that nobody planned sits in the meal for the hour it was logged, with an eaten mark; tapping it opens the row sheet (brief nutrition-items-row-sheet-and-more). Every meal on a day ahead, empty or not, has an Add control in its header (today logs eaten food, which has no meal, so it keeps the toolbar) that opens the Add sheet on that day with that meal picked (brief nutrition-header-sheet-wording). Meals are the plan, so last week has none.
export default function MealSections({ view, placed, today, editable, onLog, onMsg, onAdd }: { view: BoardDay; placed: EatenPlacement['meals']; today: string; editable: boolean; onLog: (r: Resolved, index: number) => void; onMsg: Say; onAdd: (meal: PlanSlot) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const st = () => useAppStore.getState();
  const diet = useAppStore(x => x.diet);
  const snackList = useAppStore(x => x.cfg.diet?.snacks);
  const recipes = useAppStore(x => x.recipes);
  const grocery = useAppStore(x => x.grocery), groceryMonths = useAppStore(x => x.groceryMonths);
  const cards = view.slots.flatMap(s => s.items);
  const cardsKey = cards.map(c => `${c.index}|${c.r.item.k}|${c.r.item.id}|${c.r.item.e?.join(',') ?? ''}|${c.r.gone ? 1 : 0}`).join(';'); // what the marks depend on; `view` itself is rebuilt on every board change, which would match again on every tap
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `cards` is read through `cardsKey`
  const stock = useMemo(() => dayStock(view.day, today, cards, diet, grocery, groceryMonths, recipes), [view.day, today, cardsKey, diet, grocery, groceryMonths, recipes]); // the day's at-home marks (lib/boardStock.ts)
  const repeats = useAppStore(x => x.cfg.diet?.repeats), repeatSkips = useAppStore(x => x.cfg.diet?.repeatSkips), storedPlan = useAppStore(x => x.cfg.diet?.plan);
  const allTrays = useMemo(() => (editable ? handyTrays(view.day, storedPlan ?? {}, repeats, repeatSkips, today, recipes, []) : {}), [editable, view.day, storedPlan, repeats, repeatSkips, today, recipes]); // the day's handy trays, once for all four meals
  const ctx = useMemo(() => stockContext(view.day, today, grocery, groceryMonths, recipes), [view.day, today, grocery, groceryMonths, recipes]); // for the Need flag on handy rows
  const hasSnacks = useAppStore(x => !!x.cfg.diet?.snacks?.length); // the saved daily snack list
  const slots: BoardSlot[] = [...view.slots];
  for (const s of ORDER) if (!slots.some(x => x.slot === s)) slots.push({ slot: s, items: [], kcal: 0, share: null, need: [], have: [], fixes: [] });
  slots.sort((a, b) => SLOT_KEY.indexOf(a.slot ?? '') - SLOT_KEY.indexOf(b.slot ?? ''));
  // A one-tap plate fix adds the food and marks it planned, as the check reads planned food only (brief nutrition-board-available-list).
  const addFix = (id: string, slot: PlanSlot) => onMsg(st().addPlateFix(view.day, id, slot)); // store action: finds the item it added, never assumes it is last
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
        const { plate, tray } = s.slot ? splitMeal(s.items, diet) : { plate: s.items, tray: [] }; // lib/availableTray.ts: the "Not set" group has no tray
        const rows = s.slot ? trayRows(tray, allTrays[s.slot] ?? []) : [];
        const { planned, eatenKcal, anyEaten } = mealFigures(plate, extra, diet, snackList, drinkIdsOf(recipes)); // lib/nutritionBoard.ts
        const over = slotOverText(s.slot, s.share, eatenKcal, s.slot ? SLOT_LABEL[s.slot] : 'Not set'); // lib/nutritionBoard.ts: the "Not set" group never warns
        return (
        <div key={s.slot ?? 'none'} className="wb-slot" onDragOver={e => { if (s.slot && editable) e.preventDefault(); }} onDrop={e => { if (s.slot && editable) drop(e, s.slot); }}>
          <div className="nb-slotrow">
            <div className="wb-slothd"><b>{s.slot ? SLOT_LABEL[s.slot] : 'Not set'}</b><span>{mealKcalText({ planned, available: rows.length, anyEaten }, eatenKcal)}{over && <em className="wb-over"> · {over}</em>}</span></div>
            {mealAddShown(s.slot, view.day, today) && <button type="button" className="btn sm nb-slotadd" aria-label={`Add to ${SLOT_LABEL[s.slot!]}`} onClick={() => onAdd(s.slot!)}><Icon name="plus" /><span className="nb-slotadd-t"> Add</span></button>}
          </div>
          {plate.length === 0 && extra.length === 0 && <span className="nb-empty">{s.slot === 'snack' && !hasSnacks && rows.length === 0 ? 'No daily snacks yet' : s.slot ? `Nothing planned for ${SLOT_LABEL[s.slot]}.` : 'Nothing planned'}</span>}
          {s.slot === 'snack' && editable && (hasSnacks
            ? <button type="button" className="btn sm ghost nb-slotadd" onClick={() => st().openModal({ type: 'nbsnacks' })}>Daily snacks</button>
            : <button type="button" className={`btn sm${view.day === today ? '' : ' ghost'} nb-slotadd`} onClick={() => st().openModal({ type: 'nbsnacks' })}>Set up daily snacks</button>)}
          {s.need.length > 0 && plate.length > 0 && (
            <div className="wb-plate" role="group" aria-label={`${s.slot ? SLOT_LABEL[s.slot] : ''} plate check`}>
              {s.need.map(m => <span key={m} className={`wb-mk${s.have.includes(m) ? ' on' : ''}`}>{s.have.includes(m) ? '✓ ' : ''}{MARK_LABEL[m]}</span>)}
              {s.slot && editable && <button type="button" className="wb-hide" aria-label={`Hide plate hint for ${SLOT_LABEL[s.slot]} ${view.day === today ? 'today' : `on ${shortDay(view.day)}`}`} onClick={() => st().dismissPlateHint(view.day, s.slot!)}><Icon name="close" /></button>}
            </div>
          )}
          {plate.map(x => {
            const ck = `${view.day}:${planItemKey(x.r.item)}`;
            return <BoardCard key={ck} item={x} day={view.day} today={today} open={open === ck} stock={stock.get(x.index)} onOpen={() => setOpen(open === ck ? null : ck)} onLog={onLog} onMsg={onMsg} />;
          })}
          {s.slot && editable && <AvailableTray day={view.day} slot={s.slot} rows={rows} today={today} ctx={ctx} stock={i => stock.get(i)} onLog={onLog} onMsg={onMsg} />}
          <EatenRows label={`Eaten in ${s.slot ? SLOT_LABEL[s.slot] : 'this meal'}`} entries={extra} onMsg={onMsg} />
          {s.slot && editable && s.fixes.map(f => <button type="button" key={f.mark} className="wb-fix" onClick={() => addFix(f.recipe.id, s.slot!)}>+ Add {f.mark === 'carb' ? 'a carb' : f.mark === 'protein' ? 'a protein' : 'a veg'}: {f.recipe.n}{f.why ? ` (${f.why})` : ''}</button>)}
        </div>
        );
      })}
    </>
  );
}
