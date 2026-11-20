import type { Boost, DietEntry, PlanSlot, Recipe, SavedMeal, Supplements } from '../types.ts';
import { parseDate, weekStartOf, ymd } from '../shared/dates.js';
import { shortDay, sundayOf } from './dayNames.js';
import { MAX_PLAN_AHEAD } from '../shared/diet.js';
import { shiftDay, totalsFor, missingCarbsFat, fmtNum, oldestDay } from './dietLog.js';
import { canBePlanned, isEaten, type Plan } from './dietPlan.js';
import { portionTag } from './supplementPortion.js';
import { usualMealOf } from './usualMeal.js';
import { SLOTS, scheduleOf, slotTally } from './supplements.js';
import { boardDay, type BoardDay, type BoardItem } from './weekBoard.js';
import { HOT_OZ, TRAIN_OZ_PER_30, fmtOz, goalFor, sumOz } from './water.js';

/* ---------- Nutrition as one week board (brief nutrition-board): which days a week holds, what a day's four meters show, which meal the add sheet starts on, what the Hydration and Supplements sections say. Pure; the board draws it. ---------- */

/** Weeks are Sunday to Saturday, like the Board's: 0 is the week today is in, -1 the week before it, 1 the week after, and so on (brief nutrition-meal-labels-year-repeat: any whole number inside `weekRange`; it was only -1, 0 and 1). Days before today in this week stay on it. */
export type WeekOffset = number;
/** The weeks the board can reach: back to the oldest logged week (never less than last week) and ahead as far as the plan window (52 weeks). */
export interface WeekRange { min: WeekOffset; max: WeekOffset }

const days7 = (start: string): string[] => Array.from({ length: 7 }, (_, i) => shiftDay(start, i));
const dayGap = (a: string, b: string): number => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);

/** The seven days of a week on the board, Sunday first. */
export const weekDays = (today: string, offset: WeekOffset): string[] => days7(shiftDay(sundayOf(today), offset * 7));

/** The week a day sits in, as a number from this week (a day before this week is negative). */
export const weekOf = (today: string, day: string): WeekOffset => Math.floor(dayGap(sundayOf(today), day) / 7);

/** The oldest day with a logged entry, or undefined when nothing is logged. */
export function oldestLogged(entries: readonly Pick<DietEntry, 'd'>[]): string | undefined {
  let lo: string | undefined;
  for (const e of entries) if (!lo || e.d < lo) lo = e.d;
  return lo;
}

/** The weeks on offer: from the week of `oldest` (the oldest logged day; last week at the least, as before) to the week holding the last plannable day. */
export function weekRange(today: string, oldest?: string): WeekRange {
  const keptFrom = oldestDay(today); // an entry older than the log keeps is not reachable
  const first = oldest ? (oldest > keptFrom ? oldest : keptFrom) : null;
  return { min: first ? Math.min(-1, weekOf(today, first)) : -1, max: weekOf(today, shiftDay(today, MAX_PLAN_AHEAD)) };
}

/** The week a step lands on: one week `dir` away, or null at an end of the range. */
export function stepWeek(offset: WeekOffset, dir: -1 | 1, range: WeekRange): WeekOffset | null {
  const to = offset + dir;
  return to < range.min || to > range.max ? null : to;
}

/** The day the board shows on arriving at `offset`: today in this week, else the week's first day. */
export const dayOnArrival = (today: string, offset: WeekOffset): string => (offset === 0 ? today : weekDays(today, offset)[0]!);

/** "Last week", "This week", "Next week", "In 3 weeks", "5 weeks ago". */
export function weekName(offset: WeekOffset): string {
  if (offset === 0) return 'This week';
  if (offset === -1) return 'Last week';
  if (offset === 1) return 'Next week';
  return offset > 0 ? `In ${offset} weeks` : `${-offset} weeks ago`;
}

const firstDay = (today: string, oldest?: string): string => shiftDay(sundayOf(today), weekRange(today, oldest).min * 7);
const lastDay = (today: string): string => shiftDay(sundayOf(today), weekRange(today).max * 7 + 6);

/** Whether a day is on the board at all: the first day of the oldest week on offer to the last day of the last. */
export const onBoard = (today: string, day: string, oldest?: string): boolean => day >= firstDay(today, oldest) && day <= lastDay(today);

/** How many day columns the board shows at a screen width (brief nutrition-header-sheet-wording): seven from 1440 px, three from 1000, two from 768, else one. */
export type DaysShown = 1 | 2 | 3 | 7;
export const daysShown = (width: number): DaysShown => (width >= 1440 ? 7 : width >= 1000 ? 3 : width >= 768 ? 2 : 1);

/** The `n` days of `week` to draw when `day` is the picked one: the picked day first and the days after it, held inside the week (a Saturday on a three-day board shows Thu, Fri, Sat). */
export function windowDays(week: readonly string[], day: string, n: number): string[] {
  const at = Math.max(0, week.indexOf(day));
  const start = Math.min(at, Math.max(0, week.length - n));
  return week.slice(start, start + n);
}

export type DayKind = 'past' | 'today' | 'future';
export const dayKind = (day: string, today: string): DayKind => (day < today ? 'past' : day === today ? 'today' : 'future');

/** "Sun 8": the short name a day goes by in a column header and on a tab. */
export { shortDay };

/** "Sun, Nov 8": the name in a dropdown and in the toolbar's target. */
export const longDay = (day: string): string => parseDate(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/** The dates of a week on their own ("Sep 20 to 26"); the phone shows them in the week switcher row after the week name. */
export function weekDates(today: string, offset: WeekOffset): string {
  const d = weekDays(today, offset), a = parseDate(d[0]!), b = parseDate(d[6]!);
  const m = (x: Date) => x.toLocaleDateString('en-US', { month: 'short' });
  return `${m(a)} ${a.getDate()} to ${a.getMonth() === b.getMonth() ? '' : `${m(b)} `}${b.getDate()}`;
}

/** "Last week · Nov 1 to 7" (a week that crosses a month says both months). */
export const weekLabel = (today: string, offset: WeekOffset): string => `${weekName(offset)} · ${weekDates(today, offset)}`;

/** The week list: one row per week in `range`, each named and dated, in two groups (earlier weeks, then this week and what is coming), the current week marked. */
export interface WeekChoice { offset: WeekOffset; name: string; dates: string; label: string }
export function weekChoices(today: string, range: WeekRange): WeekChoice[] {
  const out: WeekChoice[] = [];
  for (let o = range.min; o <= range.max; o++) out.push({ offset: o, name: weekName(o), dates: weekDates(today, o), label: weekLabel(today, o) });
  return out;
}

/** The toolbar's target: "Adding to Sun 8 · today". */
export const addingTo = (day: string, today: string): string => `Adding to ${shortDay(day)}${day === today ? ' · today' : ''}`;

/** Whether the day's planned meals can be ticked and moved: today and the days ahead (an earlier day has no plan). Adding food works on every day (`addMode`), and an earlier day's eaten rows open the row sheet to edit or delete (`EatenRows`); this does not gate them. */
export const foodEditable = (day: string, today: string): boolean => day >= today;

/** The meal the add sheet starts on, from the clock: before 10:30 Breakfast, to 14:30 Lunch, to 16:30 Snack, to 21:30 Dinner, else Snack. `minutes` is the minutes since midnight. */
export function mealByTime(minutes: number): PlanSlot {
  return minutes < 10 * 60 + 30 ? 'breakfast' : minutes < 14 * 60 + 30 ? 'lunch' : minutes < 16 * 60 + 30 ? 'snack' : minutes < 21 * 60 + 30 ? 'dinner' : 'snack';
}

/** The meal to start on: the last one picked when there is one, else the one for the time of day. */
export const startMeal = (last: PlanSlot | null | undefined, minutes: number): PlanSlot => last ?? mealByTime(minutes);

/** What adding food to a day does (brief nutrition-any-day-add): a day before today and today itself log what was eaten on that date; a day ahead plans (the log flows refuse days after today). */
export type AddMode = 'log' | 'plan';
export const addMode = (day: string, today: string): AddMode => (day > today ? 'plan' : 'log');

/** The add sheet's ways of adding. A future day plans (recipes and saved meals only); today and an earlier day log what was eaten. */
export type AddFlow = 'quick' | 'barcode' | 'oneoff' | 'find' | 'meals' | 'recipes' | 'copy' | 'savemeal';
export const ADD_FLOWS: Record<AddFlow, { label: string; hint: string }> = {
  quick: { label: 'Quick add', hint: 'Foods you log most, and suggestions for now' },
  barcode: { label: 'Scan and log', hint: 'Camera, then save the food to Recipes and log it' },
  oneoff: { label: 'One-off food', hint: 'Type a name, calories and protein' },
  find: { label: 'Find food', hint: 'Your past meals, your recipes and the food database; a label photo if a scan misses' },
  meals: { label: 'Saved meals', hint: 'Add a meal you saved' },
  recipes: { label: 'Recipes', hint: 'Add a recipe by portion' },
  copy: { label: 'Copy yesterday', hint: 'Tick what to copy from the day before' },
  savemeal: { label: 'Save as a meal in Recipes', hint: 'Turn what you ate into a meal in Recipes' },
};
const EAT_FLOWS: readonly AddFlow[] = ['quick', 'barcode', 'oneoff', 'find', 'meals', 'recipes', 'copy', 'savemeal'];
const PLAN_FLOWS: readonly AddFlow[] = ['meals', 'recipes'];
/** The shortcut buttons beside + Add food, so the toolbar keeps its shape on every day: today and an earlier day log (scan, quick add, one-off), a day ahead plans (recipes, saved meals). */
export const toolbarFlows = (day: string, today: string): readonly AddFlow[] => (addMode(day, today) === 'plan' ? ['recipes', 'meals'] : ['barcode', 'quick', 'oneoff']);
/** The ways to add on a day. `eaten` is how many foods that day has eaten: with none, "Save as a meal" has nothing to save, so it is not offered (owner, 2026-11-12). */
export const addFlows = (day: string, today: string, eaten: number): readonly AddFlow[] => (addMode(day, today) === 'plan' ? PLAN_FLOWS : eaten > 0 ? EAT_FLOWS : EAT_FLOWS.filter(f => f !== 'savemeal'));

/** The add sheet's menu in three labelled groups (brief nutrition-header-sheet-wording); a group with no way on that day is left out (a day ahead has no Fastest group). */
export const ADD_GROUPS: readonly { label: string; flows: readonly AddFlow[] }[] = [
  { label: 'Fastest', flows: ['quick', 'barcode', 'oneoff'] },
  { label: 'From what you have', flows: ['find', 'recipes'] },
  { label: 'Whole days and meals', flows: ['meals', 'copy', 'savemeal'] },
];
export const addGroups = (day: string, today: string, eaten: number): { label: string; flows: AddFlow[] }[] => {
  const on = addFlows(day, today, eaten);
  return ADD_GROUPS.map(g => ({ label: g.label, flows: g.flows.filter(f => on.includes(f)) })).filter(g => g.flows.length > 0);
};

export interface Meter { key: 'kcal' | 'protein' | 'carbs' | 'fat' | 'water'; label: string; unit: string; value: number; target: number | null; over: boolean; text: string; note?: string; hidden?: boolean }
/** The Supplements meter of a day: the share ticked, no target and never over. `pct` is 0 to 100; a day with nothing scheduled is an empty bar that says so. */
export interface SuppMeter { done: number; total: number; pct: number; text: string; label: string }
export interface DayView { day: string; kind: DayKind; meters: Meter[]; supps: SuppMeter; plan: BoardDay; eaten: DietEntry[]; fatNote: string | null; /** The plan's totals as a muted line under the meters, on a day ahead with something planned (ADR 126); null otherwise. */ planLine: string | null; /** The day's eaten food that no planned item's check added, placed in its meal (today) or in the "Not in a meal" group. */ placed: EatenPlacement }

const meterText = (value: number, target: number | null, unit: string): string => `${fmtNum(value)}${target ? ` / ${fmtNum(target)}` : ''} ${unit}`;
const meter = (key: Meter['key'], label: string, unit: string, value: number, target: number | null): Meter => ({ key, label, unit, value, target, over: !!target && value > target, text: meterText(value, target, unit) });

/** The carbs meter (after protein): shown only with a carbs target or logged carbs, the rule fat uses, on every day (it counts the log like the other bars, ADR 126). With neither it is hidden; the note saying so is left off a day ahead, where it would repeat on every column. */
export function carbsMeter(ahead: boolean, eaten: number, target: number | null): Meter {
  const m = meter('carbs', 'Carbs', 'g', eaten, target);
  if (!target && eaten <= 0) return { ...m, hidden: true, ...(ahead ? {} : { note: 'Add a carbs target or log carbs to see carbs here.' }) };
  return m;
}

/** Where today's food that nobody planned goes: the meal for the hour it was logged (`DietEntry.t`). Breakfast before 11, Lunch before 16, Dinner before 22, Snack otherwise: one default, edit it here. */
export const MEAL_CUTOFFS: readonly { slot: PlanSlot; before: number }[] = [{ slot: 'breakfast', before: 11 }, { slot: 'lunch', before: 16 }, { slot: 'dinner', before: 22 }];
export function mealForHour(hour: number): PlanSlot {
  for (const c of MEAL_CUTOFFS) if (hour < c.before) return c.slot;
  return 'snack';
}

export interface EatenPlacement { meals: Record<PlanSlot, DietEntry[]>; none: DietEntry[] }
/** The day's eaten food, minus what a planned item's check added (the planned card shows that one itself), placed: food logged from a recipe with a usual meal goes to that meal today and ahead (owner, 2026-11-18); else today's entries with an hour go to their meal; an entry with no hour, and every other entry on another day, goes to the "Not in a meal" group. */
export function placeEaten(day: string, today: string, eaten: readonly DietEntry[], plan: BoardDay, recipes: readonly Pick<Recipe, 'id' | 'meal'>[] = []): EatenPlacement {
  const checked = new Set(plan.slots.flatMap(s => s.items.flatMap(x => x.r.item.e ?? [])));
  const out: EatenPlacement = { meals: { breakfast: [], lunch: [], dinner: [], snack: [] }, none: [] };
  for (const e of eaten) {
    if (checked.has(e.id)) continue;
    const usual = e.from ? usualMealOf(e.from, recipes) : undefined;
    if (usual && day >= today) out.meals[usual].push(e); // a past day draws no meals, only "Not in a meal", so its rows stay there or they would show nowhere
    else if (day === today && typeof e.t === 'number') out.meals[mealForHour(e.t)].push(e); else out.none.push(e);
  }
  return out;
}

/** A meal's header line (wording A, owner 2026-11-19; brief nutrition-board-available-list). Food that is not ticked as eaten never counts toward calories, so the menu is told in words: "4 on the menu", and "· 2 planned" once something is marked planned. Once food is eaten the line leads with its calories: "245 kcal eaten". "Eaten" means a plan item is ticked or food nobody planned was logged there (`anyEaten`), not that its calories are above 0, so a ticked 0 kcal item reads "0 kcal eaten". `eatenKcal` is the ticked plan food plus the eaten food nobody planned; nothing else is ever added to it. A meal with no items and nothing eaten has no line. */
export function mealKcalText(meal: { items: number; planned: number; anyEaten: boolean }, eatenKcal: number): string {
  const planned = meal.planned > 0 ? ` · ${meal.planned} planned` : '';
  if (meal.anyEaten) return `${eatenKcal.toLocaleString('en-US')} kcal eaten${planned}`;
  return meal.items > 0 ? `${meal.items} on the menu${planned}` : '';
}

/** The two figures a meal header needs: its planned count (items marked planned that can be planned: never a listed daily snack or a drink) its eaten calories (ticked plan food plus the eaten food nobody planned; unticked food adds nothing) and whether anything was eaten at all (a ticked item with no calories still counts). */
export function mealFigures(items: readonly Pick<BoardItem, 'r'>[], extra: readonly DietEntry[], diet: readonly DietEntry[], snacks?: readonly { id: string }[], drinks?: ReadonlySet<string>): { planned: number; eatenKcal: number; anyEaten: boolean } {
  const planned = items.filter(x => x.r.item.p === true && canBePlanned(x.r.item, snacks, drinks)).length;
  const eatenKcal = items.reduce((a, x) => a + (isEaten(x.r.item, diet) ? x.r.kcal ?? 0 : 0), 0) + extra.reduce((a, e) => a + e.kcal, 0);
  const anyEaten = extra.length > 0 || items.some(x => isEaten(x.r.item, diet));
  return { planned, eatenKcal, anyEaten };
}

/** The muted warning beside a meal's header: "25 over snack share", only when a target gives the meal a share and eaten food passes it. Never a block; null otherwise (and always null with no target). `label` is the meal's name. */
export const mealOverText = (share: number | null, eatenKcal: number, label: string): string | null =>
  share !== null && eatenKcal > share ? `${(eatenKcal - share).toLocaleString('en-US')} over ${label.toLowerCase()} share` : null;

/** The warning for one meal group of the board. The "Not set" group (`slot` null, items with no meal) has no meal share to compare with, so it never warns, by design (ADR 139 follow-up); a meal gets `mealOverText`. */
export const slotOverText = (slot: PlanSlot | null, share: number | null, eatenKcal: number, label: string): string | null =>
  slot === null ? null : mealOverText(share, eatenKcal, label);

/** What a day's targets are. */
export interface DayTargets { kcal: number | null; protein: number | null; fat: number | null; carbs?: number | null }

/** The plan's totals on a day ahead, kept out of the meters (ADR 126: a bar moves only when food is checked off or logged as eaten): "Planned: 2,100 kcal · 160 g protein · 70 g fat". Fat reads "fat not entered" when no planned food has it and says how many foods do when only some do. Null for today and past days, and for a day with nothing planned. */
export function planLine(plan: BoardDay, ahead: boolean): string | null {
  if (!ahead || plan.count === 0) return null;
  const parts = [`${fmtNum(plan.kcal)} kcal`, `${fmtNum(plan.protein)} g protein`];
  if (plan.fatState === 'full') parts.push(`${fmtNum(plan.fat)} g fat`);
  if (plan.fatState === 'hidden') parts.push('fat not entered');
  if (plan.fatState === 'partial') parts.push(`${fmtNum(plan.fat)} g fat (${plan.fatFoods.known} of ${plan.fatFoods.all} foods have fat)`);
  return `Planned: ${parts.join(' · ')}`;
}

/** A day as the board draws it: four meters (calories, protein, fat from the diet log on every day, so food only counts once it is eaten or checked off; a day ahead reads 0 and shows its plan in `planLine`; water from the water log against that day's goal), the plan's meals, and the eaten food. */
export function dayView(day: string, today: string, a: { plan: Plan; recipes: Recipe[]; meals: SavedMeal[]; moved?: Readonly<Record<string, string>>; diet: DietEntry[]; supp: Supplements; body: { d: string; w: number }[]; targets: DayTargets; hintsOff?: readonly PlanSlot[]; hintSkips?: Readonly<Record<string, readonly PlanSlot[]>> }): DayView {
  const plan = boardDay(a.plan, day, a.recipes, a.meals, a.targets.kcal, a.moved, { off: a.hintsOff, skips: a.hintSkips });
  const eaten = a.diet.filter(e => e.d === day);
  const tot = totalsFor(a.diet, day);
  const water = goalFor(a.supp, a.body, day);
  const ahead = day > today;
  const meters: Meter[] = [
    meter('kcal', 'Calories', 'kcal', tot.kcal, a.targets.kcal),
    meter('protein', 'Protein', 'g', tot.protein, a.targets.protein),
    carbsMeter(ahead, tot.carbs, a.targets.carbs ?? null),
    meter('fat', 'Fat', 'g', tot.fat, a.targets.fat),
    meter('water', 'Water', 'oz', sumOz(a.supp.water[day]), water.oz),
  ];
  const fatNote = !ahead && eaten.length > 0 && missingCarbsFat(a.diet, day) ? 'Carbs and fat count only what you enter.' : null;
  return { day, kind: dayKind(day, today), meters, supps: suppMeter(a.supp, day), plan, eaten, fatNote, planLine: planLine(plan, ahead), placed: placeEaten(day, today, eaten, plan, a.recipes) };
}

/** The Supplements meter (drawn before Water): "2 of 4 taken" fills 50%; nothing scheduled says "None scheduled" with an empty bar. Counts ticks on any day. */
export function suppMeter(supp: Supplements, day: string): SuppMeter {
  const { done, total } = supplementDay(supp, day);
  const text = total ? `${done} of ${total} taken` : 'None scheduled';
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0, text, label: `Supplements taken: ${text}` };
}

/** The label of a meter for a screen reader: the numbers in words, eaten (or drunk) so far on today and days ahead, eaten on a past day. */
export const meterLabel = (m: Meter, kind: DayKind): string =>
  `${m.label} ${m.key === 'water' ? 'drunk' : kind === 'past' ? 'eaten' : 'eaten so far'}: ${m.text}${m.over ? `, ${fmtNum(Math.round((m.value - (m.target ?? 0)) * 10) / 10)} ${m.unit} over` : ''}${m.target ? '' : ', no target set'}`;

export interface HydrationView { goal: number; drunk: number; left: number; status: string; tags: string[]; lines: { label: string; oz: number }[]; future: boolean }

/** The Hydration section of a day: the goal, what is left, the reason tags (hot day, training) and the goal broken down line by line. A day that has not come yet with nothing logged says "Goal n oz". */
export function hydrationView(day: string, today: string, supp: Supplements, body: { d: string; w: number }[]): HydrationView {
  const g = goalFor(supp, body, day);
  const drunk = sumOz(supp.water[day]);
  const left = Math.max(0, Math.round((g.oz - drunk) * 10) / 10);
  const future = day > today;
  const status = future && drunk === 0 ? `Goal ${fmtOz(g.oz)} oz` : left > 0 ? `${fmtOz(left)} oz to go` : 'Goal met';
  const b: Boost | undefined = supp.boost?.[day];
  const tags = [...(g.extra.hot ? [`Hot day +${fmtOz(g.extra.hot)}`] : []), ...(g.extra.train ? [`Training ${b?.mins ?? 0} min +${fmtOz(g.extra.train)}`] : [])];
  const base = g.source === 'weight' ? `Base, half of ${fmtOz(g.lb ?? 0)} lb` : g.source === 'default' ? 'Base (no body weight logged)' : 'Base, set by you';
  const lines = [{ label: base, oz: g.baseOz }, ...(g.extra.hot ? [{ label: 'Hot day', oz: g.extra.hot }] : []), ...(g.extra.train ? [{ label: `Training ${b?.mins ?? 0} min`, oz: g.extra.train }] : [])];
  return { goal: g.oz, drunk, left, status, tags, lines, future };
}

export { HOT_OZ, TRAIN_OZ_PER_30 };

export interface SupplementDay { done: number; total: number; text: string; /** Library-only supplements taken that day through the Add button (they have no time of day): listed under the ticks and counted in "x of n". */ extra: { id: string; n: string; dose: string; taken: true }[]; slots: { slot: string; label: string; items: { id: string; n: string; dose: string; taken: boolean; /** "1 capsule" when taken at other than one serving (brief supplement-portions); empty otherwise. */ tag: string }[] }[] }

/** A day's supplements as Morning, Noon and Night with each tick, and "x of n taken". Ticking works on any day. */
export function supplementDay(supp: Supplements, day: string): SupplementDay {
  const by = scheduleOf(supp.items);
  const slots = SLOTS.map(([slot, label]) => ({ slot, label, items: (by[slot] ?? []).map(i => ({ id: i.id, n: i.n, dose: i.dose ?? '', taken: !!supp.taken[day]?.[i.id], tag: portionTag(i) })) }));
  const extra = supp.items.filter(i => !i.slot && supp.taken[day]?.[i.id]).map(i => ({ id: i.id, n: i.n, dose: i.dose ?? '', taken: true as const }));
  const total = slots.reduce((a, s) => a + s.items.length, 0) + extra.length;
  const done = slots.reduce((a, s) => a + slotTally(supp.items, supp.taken, day, s.slot).done, 0) + extra.length;
  return { done, total, text: total ? `${done} of ${total} taken` : 'Nothing scheduled', extra, slots };
}

/** What the Add supplement picker offers on a day: the supplements in your library with no time of day that you have not already taken that day. Choosing one ticks it for the day. */
export const suppPickList = (supp: Supplements, day: string): { id: string; n: string; dose: string }[] =>
  supp.items.filter(i => !i.slot && !supp.taken[day]?.[i.id]).map(i => ({ id: i.id, n: i.n, dose: i.dose ?? '' }));
