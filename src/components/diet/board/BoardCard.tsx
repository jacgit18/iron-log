import { canBePlanned, isEaten } from '../../../lib/dietPlan.js';
import { eatenMax, loggedEntry, plannedEntryStep, plannedStep, tickLabel, tickWord } from '../../../lib/eatenStep.js';
import { amountText } from '../../../lib/foodUnit.js';
import { macroLine } from '../../../lib/macroLine.js';
import { cardVitamins } from '../../../lib/microLine.js';
import { NEED_TO_BUY, isNeedFood, tickHeld } from '../../../lib/haveOnly.js';
import { planForward } from '../../../lib/planForward.js';
import { drinkIdsOf } from '../../../lib/recipeUses.js';
import type { CardStock } from '../../../lib/boardStock.js';
import type { BoardItem } from '../../../lib/weekBoard.js';
import { useAppStore } from '../../../store/useAppStore.js';
import { useState } from 'react';
import ArmedButton from '../../ArmedButton.jsx';
import NeedFlag from '../../nutritionBoard/NeedFlag.js';
import PlanAsk from '../../nutritionBoard/PlanAsk.js';
import PortionStepper from '../../PortionStepper.js';
import { MicroLine, MicroList } from '../../nutritionBoard/MicroLine.js';

// One item on the board: its name, calories and protein; on the plate (planned or eaten) today it has a check box that logs it as eaten (and unchecking removes what it logged); in a meal's Available tray (`variant="tray"`, brief nutrition-planned-available-tray) it has Ate and Plan buttons instead (Plan asks how far it applies when the food has a future copy); tapping the card opens Less, More, Copy to, Move to, Repeat and Remove, and Unplan on a planned one. A ready-made food that is Need carries Need to buy and its tick waits until Have. Copy to and Move to open a sheet with the day picker (PlanMoveSheet, brief nutrition-multi-day-picker).
// A listed daily snack or a repeat that is only shown on this day (`item.virtual`, briefs daily-snacks and nutrition-meal-labels-year-repeat) is stored as a real item of the day first when it is ticked, changed or moved; its Remove skips it for this day only; it is not dragged.
export default function BoardCard({ item, day, today, open, stock, variant = 'plate', onOpen, onLog, onMsg }: {
  item: BoardItem; day: string; today: string; open: boolean; variant?: 'plate' | 'tray'; stock?: CardStock | undefined; // the at-home mark from Groceries (lib/boardStock.ts, brief grocery-stock-flag): text and a colour, no action
  onOpen: () => void; onLog: (r: BoardItem['r'], index: number) => void; onMsg: (t: string) => void;
}) {
  const { r, index } = item;
  const st = () => useAppStore.getState();
  const eaten = useAppStore(s => isEaten(r.item, s.diet));
  const entry = useAppStore(s => (isEaten(r.item, s.diet) && r.item.k === 'r' ? loggedEntry(r.item.e, s.diet) : undefined)); // the one entry a ticked recipe card logged: Less and More change it together with the plan
  const lessT = entry ? plannedEntryStep(entry, -1, eatenMax(r.recipe)) : null, moreT = entry ? plannedEntryStep(entry, 1, eatenMax(r.recipe)) : null; // a ticked card steps its entry's own count (an edit to the entry is kept) and the plan follows
  const less = entry ? lessT?.count ?? null : plannedStep(r.portion, -1), more = entry ? moreT?.count ?? null : plannedStep(r.portion, 1);
  const vit = cardVitamins(r.item.k, entry, r.recipe, r.portion); // a saved meal card and a food with no vitamins draw nothing (lib/microLine.ts)
  const checkable = day === today && !r.gone;
  const name = r.item.k === 'm' ? `${r.name} (meal)` : r.name;
  // The item's place in the stored plan: a shown daily snack is stored now (never refused for a full day: snacks do not count toward the 8).
  const real = (): number => {
    if (!item.virtual) return index;
    const at = r.item.rp ? st().realizeRepeat(day, r.item.rp) : st().realizeDailySnack(day, r.item.id);
    if (typeof at === 'string') { onMsg(at); return -1; }
    return at;
  };
  // The sheet may stay open while another device edits the plan: before acting, check the card is still the same food at its place.
  const stillHere = (): number => {
    const at = real();
    if (at < 0) return -1;
    const now = st().cfg.diet?.plan?.[day]?.[at];
    if (!now || now.k !== r.item.k || now.id !== r.item.id) { onMsg('That card changed. Open it again.'); return -1; }
    return at;
  };
  // Copy to and Move to open the picker sheet; a shown daily snack is stored only when the sheet's button is pressed (`prepare`), so closing the sheet leaves nothing behind.
  const pick = (mode: 'copy' | 'move') => { st().openModal({ type: 'nbplanmove', mode, day, name: r.name, slot: r.item.s, prepare: stillHere, onMsg }); onOpen(); }; // the card folds as the sheet opens
  // Repeat opens the Repeat sheet for this food on this day; a daily snack has its own list (Daily snacks), so it has no Repeat button.
  const repeatable = day >= today && !r.gone && (!item.virtual || !!r.item.rp);
  const repeat = () => { st().openModal({ type: 'nbrepeat', day, name: r.name, item: { k: r.item.k, id: r.item.id, ...(r.item.x ? { x: r.item.x } : {}), ...(r.item.s ? { s: r.item.s } : {}) }, ...(r.item.rp ? { rp: r.item.rp } : {}), onMsg }); onOpen(); };
  // Plan and Unplan (brief nutrition-planned-available-tray): only a planned item counts toward the day's 8; a shown repeat is stored first, a listed daily snack and a drink are never planned things.
  const plannable = useAppStore(s => canBePlanned(r.item, s.cfg.diet?.snacks, drinkIdsOf(s.recipes))); // a stored daily snack or a drink is never a planned thing: no button, no pill
  const drink = useAppStore(s => r.item.k === 'r' && drinkIdsOf(s.recipes).has(r.item.id));
  const planned = r.item.p === true && plannable, canPlan = plannable && !r.gone && !eaten && day >= today && !(item.virtual && !r.item.rp);
  const everyDay = useAppStore(s => !!r.item.rp && s.cfg.diet?.repeats?.find(x => x.rid === r.item.rp)?.p === true); // a shown repeat that is planned on every day it appears
  const needFood = isNeedFood(r.recipe, stock?.kind), held = tickHeld(needFood, eaten);
  const [asking, setAsking] = useState(false);
  const say = (res: { ok: boolean; message: string }) => { if (res.message) onMsg(res.message); };
  const plan = () => {
    const s = st();
    const fp = planForward(s.cfg.diet?.plan ?? {}, s.cfg.diet?.repeats, day, { k: r.item.k, id: r.item.id, s: r.item.s, rp: r.item.rp }, today, s.cfg.diet?.snacks, drinkIdsOf(s.recipes));
    if (fp.ask) setAsking(true); else say(s.planRow(day, item.virtual ? { rid: r.item.rp! } : { index }, false));
  };
  const planWith = (forward: boolean) => { setAsking(false); say(st().planRow(day, item.virtual ? { rid: r.item.rp! } : { index }, forward)); if (open) onOpen(); };
  const unplan = () => { const err = st().unplanRow(day, index, item.virtual ? r.item.rp : undefined); if (err) onMsg(err); onOpen(); };
  const portion = (to: number) => { const at = real(); if (at >= 0) st().setPlanPortion(day, at, to); };
  const tickedStep = (step: { count: number; plan: number | null } | null) => {
    if (!entry || !step) return;
    const at = real();
    if (at < 0) return;
    const err = st().setDietPortion(entry.id, step.count, eatenMax(r.recipe)); // the entry first, so a refusal leaves the plan unchanged
    if (err) { onMsg(err); return; }
    if (step.plan !== null) st().setPlanPortion(day, at, step.plan);
  };
  const tick = () => {
    if (eaten) { st().uncheckPlanItem(day, index); return; }
    const at = real();
    if (at < 0) return;
    onLog(r, at);
    if (item.virtual) { if (r.item.rp) st().unstoreRepeat(day, at, r.item.rp); else st().unstoreDailySnack(day, at); } // a log that failed leaves nothing stored: the snack or repeat is only shown again
  };
  return (
    <div className={`wb-cardwrap${eaten ? ' eaten' : ''}`}>
      <div className="nb-cardrow">
      {checkable && variant === 'plate' && <button type="button" role="checkbox" aria-checked={eaten} aria-disabled={held} disabled={held} className="nb-eatck" aria-label={tickLabel(r.name, drink, eaten)} onClick={tick}><i aria-hidden="true">✓</i></button>}
      <button type="button" className={`wb-card${open ? ' open' : ''}`} draggable={!item.virtual} aria-expanded={open} data-from={`${day}:${index}`} onClick={onOpen}
        onDragStart={e => { e.dataTransfer.setData('text/plain', JSON.stringify({ day, index })); e.dataTransfer.effectAllowed = 'move'; }}>
        <span className="wb-ct">{name}{r.portion !== 1 ? ` × ${r.portion}` : ''}{planned && <span className="wb-planned">Planned{everyDay ? ' · every day' : ''}</span>}{stock && <span className={`wb-stock ${stock.kind}`}>{needFood ? NEED_TO_BUY : stock.text}</span>}</span>
        <span className="wb-cm">{r.gone ? 'Removed' : macroLine({ ...(r.kcal !== undefined ? { kcal: r.kcal } : {}), ...(r.p !== undefined ? { p: r.p } : {}) }) || 'Needs numbers'}</span>
        {vit && !r.gone && <MicroLine micro={vit.micro} factor={vit.factor} est={vit.est} />}
      </button>
      </div>
      {variant === 'tray' && (
        <div className="nb-trayacts">
          {checkable && <button type="button" className="btn sm" aria-label={`${tickWord(drink)} ${r.name}`} disabled={held} onClick={tick}>{tickWord(drink)}</button>}
          {canPlan && <button type="button" className="btn sm" aria-label={`Plan ${r.name}`} onClick={plan}>Plan</button>}
        </div>
      )}
      {asking && <PlanAsk name={r.name} onOne={() => planWith(false)} onForward={() => planWith(true)} onCancel={() => setAsking(false)} />}
      {needFood && r.recipe && !eaten && <NeedFlag recipe={r.recipe} today={today} />}
      {entry && r.recipe && ( // a ticked recipe card: the same stepper line as an eaten row (brief nutrition-log-first-portion-row); it steps the plan's portion and the logged entry together
        <PortionStepper name={r.name} text={amountText(entry.x ?? 1, r.recipe)} less={less} more={more} onLess={() => tickedStep(lessT)} onMore={() => tickedStep(moreT)} />
      )}
      {open && vit && !r.gone && <MicroList micro={vit.micro} factor={vit.factor} est={vit.est} />}
      {open && (
        <div className="wb-acts">
          {r.item.k === 'r' && !r.gone && !entry && <button type="button" className="btn sm" aria-label={`Less ${r.name}`} disabled={less === null} onClick={() => less !== null && portion(less)}>Less</button>}
          {r.item.k === 'r' && !r.gone && !entry && <button type="button" className="btn sm" aria-label={`More ${r.name}`} disabled={more === null} onClick={() => more !== null && portion(more)}>More</button>}
          {planned && !eaten && day >= today && <button type="button" className="btn sm" aria-label={`Unplan ${r.name}`} onClick={unplan}>Unplan</button>}
          <button type="button" className="btn sm" aria-label={`Copy ${r.name}`} aria-haspopup="dialog" onClick={() => pick('copy')}>Copy to…</button>
          <button type="button" className="btn sm" aria-label={`Move ${r.name}`} aria-haspopup="dialog" onClick={() => pick('move')}>Move to…</button>
          {r.gone && r.item.rp && <ArmedButton className="btn sm" aria-label={`Stop repeating ${r.name}`} label="Stop repeating" armedLabel="Tap again to stop" onConfirm={() => { st().stopRepeat(r.item.rp!); onOpen(); }} />}
          {repeatable && <button type="button" className="btn sm" aria-label={`Repeat ${r.name}`} aria-haspopup="dialog" onClick={repeat}>Repeat…</button>}
          {item.virtual
            ? <ArmedButton className="btn sm" aria-label={r.item.rp ? `Skip ${r.name} this day` : `Skip ${r.name} today`} label={r.item.rp ? 'Skip this day' : 'Skip today'} armedLabel="Tap again to skip" onConfirm={() => { if (r.item.rp) st().skipRepeatDay(day, r.item.rp); else st().skipDailySnack(day, r.item.id); onOpen(); }} />
            : <ArmedButton className="btn sm" aria-label={`Remove ${r.name}`} label="Remove" armedLabel="Tap again to remove" onConfirm={() => { st().removePlanItem(day, index); onOpen(); }} />}
        </div>
      )}
    </div>
  );
}
