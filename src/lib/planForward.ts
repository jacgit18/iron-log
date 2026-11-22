import { MAX_PLAN_ITEMS, plannedCount, samePlanItem } from '../shared/diet.js';
import type { DailySnack, PlanItem, PlanSlot, RepeatItem } from '../types.ts';
import { shortDay } from './dayNames.js';
import { inWindow, markPlanned, type Plan } from './dietPlan.js';
import { isHandy, repeatFor } from './repeats.js';

/* ---------- Plan "this day and every future day it appears" (brief nutrition-planned-available-tray, ADR 146). Pure; the store writes the result in one change. ---------- */

/** What a forward Plan would mark: the stored copies of the food on later days (`marks`, by day and place in that day's list), the later days it skips because they already hold MAX_PLAN_ITEMS planned things (`full`), and the repeat that stands for it (`repeat`, its `rid`; a repeat is marked planned so every day it shows has the food planned). `ask` is whether there is any future copy at all: with none, Plan marks this day without a question. */
export interface ForwardPlan { marks: { day: string; index: number }[]; full: string[]; repeat: string | null; ask: boolean }

/** The food a forward Plan is for: kind, id and meal, plus `rp` when it is a repeat shown that day. */
export type ForwardItem = Pick<PlanItem, 'k' | 'id'> & { s?: PlanSlot | undefined; rp?: string | undefined };

/** The later days a Plan on `day` would reach. A listed daily snack and a drink never count as planned, so they have no forward Plan (the caller asks `canBePlanned` first). A handy food is a tray item of every day, not a repeat on the card: it is planned for this day only. */
export function planForward(plan: Plan, repeats: readonly RepeatItem[] | undefined, day: string, item: ForwardItem, today: string, snacks?: readonly DailySnack[], drinks?: ReadonlySet<string>): ForwardPlan {
  const food: PlanItem = { k: item.k, id: item.id, ...(item.s ? { s: item.s } : {}) };
  const marks: ForwardPlan['marks'] = [], full: string[] = [];
  for (const d of Object.keys(plan).sort()) {
    if (d <= day || !inWindow(d, today)) continue;
    const list = plan[d]!, index = list.findIndex(i => samePlanItem(i, food));
    if (index < 0 || list[index]!.p === true) continue;
    if (plannedCount(list, snacks, drinks) >= MAX_PLAN_ITEMS) full.push(d); else marks.push({ day: d, index });
  }
  const rep = repeatFor(repeats, { ...food, ...(item.rp ? { rp: item.rp } : {}) }, day);
  const repeat = rep && !isHandy(rep) && rep.p !== true ? rep.rid : null;
  return { marks, full, repeat, ask: marks.length + full.length > 0 || repeat !== null };
}

/** `plan` and `repeats` after a forward Plan of the item at `index` of `day`: this day's item planned, each later copy in `fp.marks` planned, the repeat marked planned. An error text (the plan and repeats unchanged) when this day already holds MAX_PLAN_ITEMS planned things. */
export function applyForward(plan: Plan, repeats: readonly RepeatItem[] | undefined, fp: ForwardPlan, day: string, index: number, snacks?: readonly DailySnack[], drinks?: ReadonlySet<string>): { plan: Plan; repeats: RepeatItem[] | undefined; error: null } | { plan: null; repeats: null; error: string } {
  const first = markPlanned(plan, day, index, true, snacks, drinks);
  if (first.error !== null) return { plan: null, repeats: null, error: first.error };
  let next = first.plan;
  for (const m of fp.marks) { const r = markPlanned(next, m.day, m.index, true, snacks, drinks); if (r.error === null) next = r.plan; }
  return { plan: next, repeats: repeats && fp.repeat ? repeats.map(r => (r.rid === fp.repeat ? { ...r, p: true as const } : r)) : repeats?.slice(), error: null };
}

/** The message after a forward Plan: what was planned, and the days it skipped. */
export function forwardText(name: string, day: string, fp: Pick<ForwardPlan, 'full'>): string {
  const skipped = fp.full.length ? ` Not planned on ${fp.full.map(shortDay).join(', ')}: ${MAX_PLAN_ITEMS} things are planned there already.` : '';
  return `Planned ${name} for ${shortDay(day)} and every future day it appears.${skipped}`;
}
