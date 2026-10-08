/* ---------- Command contract (ADR 008) ----------
   One module for what the phone sends and the API accepts. Each command has a name, an input type and a validator;
   the offline queue stores a Command and replays it unchanged. Framework-free: client and server import it. */

import type { BodyEntry, Boost, Experiment, LibraryItem, LogEntry, Program, ProgKey, Stretch, StretchExperiment, StretchWeek, SupplementItem, Week } from '../types.ts';
import { LIMITS, normBody, normEntry, normLibrary, normProgram, validDate } from './validate.js';
import { normConfigDoc, type ConfigDoc } from './config.js';
import { normStretchWeek } from './stretchWeek.js';
import { withAllDays } from '../lib/data.js';
import { normExperimentItem, normStretchExperimentItem, normStretchItem, normSupplementItem } from './listItems.js';
import { normBoost, normTakenDay, normWaterDay } from './supplementDay.js';
import { normWeek } from './week.js';

/** What the offline queue stores and `POST /api/commands/<name>` receives. */
export interface Command<N extends string, I> {
  name: N;
  /** Idempotency key: a retry with the same clientId returns the row it created. */
  clientId: string;
  /** The row version the user saw when editing; null for a create. */
  baseVersion: number | null;
  input: I;
}

/** One log entry: one exercise on one day, with its sets (confirmed 2026-10-07). */
export interface LogSessionInput {
  exerciseId: string;
  entry: LogEntry;
}

export type LogSessionCommand = Command<'log-session', LogSessionInput>;

export function validateLogSession(input: unknown): LogSessionInput | null {
  if (!input || typeof input !== 'object') return null;
  const { exerciseId, entry } = input as Record<string, unknown>;
  if (typeof exerciseId !== 'string' || !exerciseId || exerciseId.length > LIMITS.text.id) return null;
  const clean = normEntry(entry);
  return clean ? { exerciseId, entry: clean } : null;
}

/** A check-off: the planned numbers for one card in one week, marked auto. Always a create (baseVersion null). */
export type TickCardInput = LogSessionInput;
export type TickCardCommand = Command<'tick-card', TickCardInput>;

export function validateTickCard(input: unknown): TickCardInput | null {
  const out = validateLogSession(input);
  return out && out.entry.auto === true && out.entry.slot && out.entry.wk ? out : null;
}

/** Unticking a card for a week. Without `exerciseId` it covers the whole card, including a check-off left under an
 *  exercise the card no longer has. `removeLogged` also removes what the user logged by hand for the card that week
 *  (the checkboxes do; skipping a card does not). Targets rows by card and week, so there is no baseVersion. */
export interface UntickCardInput {
  slot: string;
  wk: string;
  exerciseId?: string;
  removeLogged?: boolean;
}
export type UntickCardCommand = Command<'untick-card', UntickCardInput>;

export function validateUntickCard(input: unknown): UntickCardInput | null {
  if (!input || typeof input !== 'object') return null;
  const { slot, wk, exerciseId, removeLogged } = input as Record<string, unknown>;
  if (typeof slot !== 'string' || !slot || slot.length > LIMITS.text.slot || !validDate(wk)) return null;
  if (exerciseId !== undefined && (typeof exerciseId !== 'string' || !exerciseId || exerciseId.length > LIMITS.text.id)) return null;
  if (removeLogged !== undefined && typeof removeLogged !== 'boolean') return null;
  return { slot, wk, ...(exerciseId !== undefined ? { exerciseId } : {}), ...(removeLogged ? { removeLogged } : {}) };
}

/** Delete one logged session or check-off by its id. baseVersion is the version the user saw (never null). */
export interface DeleteEntryInput {
  entryId: string;
}
export type DeleteEntryCommand = Command<'delete-entry', DeleteEntryInput>;

export function validateDeleteEntry(input: unknown): DeleteEntryInput | null {
  if (!input || typeof input !== 'object') return null;
  const { entryId } = input as Record<string, unknown>;
  return typeof entryId === 'string' && entryId && entryId.length <= LIMITS.text.id ? { entryId } : null;
}

/** One body-weight entry for a week (the week is the key, there is no client id). */
export type LogBodyWeightInput = Pick<BodyEntry, 'wk' | 'd' | 'w'>;
export type LogBodyWeightCommand = Command<'log-body-weight', LogBodyWeightInput>;

export function validateLogBodyWeight(input: unknown): LogBodyWeightInput | null {
  const [clean] = normBody([input]);
  return clean ? { wk: clean.wk, d: clean.d, w: clean.w } : null;
}

/** Delete the body-weight entry for a week. baseVersion is the version the user saw (never null). */
export interface DeleteBodyWeightInput {
  wk: string;
}
export type DeleteBodyWeightCommand = Command<'delete-body-weight', DeleteBodyWeightInput>;

export function validateDeleteBodyWeight(input: unknown): DeleteBodyWeightInput | null {
  if (!input || typeof input !== 'object') return null;
  const { wk } = input as Record<string, unknown>;
  return validDate(wk) ? { wk } : null;
}

/** Replace the whole document for one week. The week is the key (`weekStart` is its first day, ADR 011). baseVersion is
 *  the version the user saw, or null when the phone has never seen a row for that week. */
export interface SaveWeekInput {
  weekStart: string;
  week: Week;
}
export type SaveWeekCommand = Command<'save-week', SaveWeekInput>;

export function validateSaveWeek(input: unknown): SaveWeekInput | null {
  if (!input || typeof input !== 'object') return null;
  const { weekStart, week } = input as Record<string, unknown>;
  return validDate(weekStart) && week && typeof week === 'object' ? { weekStart, week: normWeek(week) } : null;
}

export interface SaveStretchWeekInput {
  weekStart: string;
  week: StretchWeek;
}
export type SaveStretchWeekCommand = Command<'save-stretch-week', SaveStretchWeekInput>;

export function validateSaveStretchWeek(input: unknown): SaveStretchWeekInput | null {
  if (!input || typeof input !== 'object') return null;
  const { weekStart, week } = input as Record<string, unknown>;
  return validDate(weekStart) && week && typeof week === 'object' ? { weekStart, week: normStretchWeek(week) } : null;
}

/** Delete the document for a week (erasing data). baseVersion is the version the user saw (never null). */
export interface DeleteWeekInput {
  weekStart: string;
}
export type DeleteWeekCommand = Command<'delete-week', DeleteWeekInput>;
export type DeleteStretchWeekCommand = Command<'delete-stretch-week', DeleteWeekInput>;

export function validateDeleteWeek(input: unknown): DeleteWeekInput | null {
  if (!input || typeof input !== 'object') return null;
  const { weekStart } = input as Record<string, unknown>;
  return validDate(weekStart) ? { weekStart } : null;
}

/** Replace the whole record for one day: the water drinks (ounces), the day's boost and the supplements ticked off.
 *  The day is the key. baseVersion is the version the user saw, or null when the phone has never seen a row for that day. */
export interface SaveSupplementDayInput {
  day: string;
  water: number[];
  boost: Boost | null;
  taken: Record<string, true>;
}
export type SaveSupplementDayCommand = Command<'save-supplement-day', SaveSupplementDayInput>;

export function validateSaveSupplementDay(input: unknown): SaveSupplementDayInput | null {
  if (!input || typeof input !== 'object') return null;
  const { day, water, boost, taken } = input as Record<string, unknown>;
  return validDate(day) ? { day, water: normWaterDay(water), boost: normBoost(boost), taken: normTakenDay(taken) } : null;
}

/** Delete the record for a day. baseVersion is the version the user saw (never null). */
export interface DeleteSupplementDayInput {
  day: string;
}
export type DeleteSupplementDayCommand = Command<'delete-supplement-day', DeleteSupplementDayInput>;

export function validateDeleteSupplementDay(input: unknown): DeleteSupplementDayInput | null {
  if (!input || typeof input !== 'object') return null;
  const { day } = input as Record<string, unknown>;
  return validDate(day) ? { day } : null;
}

/** Replace the whole body of program A or B. Saved versions are library items, not programs. */
export interface SaveProgramInput {
  key: ProgKey;
  program: Omit<Program, 'key'>;
}
export type SaveProgramCommand = Command<'save-program', SaveProgramInput>;

export function validateSaveProgram(input: unknown): SaveProgramInput | null {
  if (!input || typeof input !== 'object') return null;
  const { key, program } = input as Record<string, unknown>;
  if (key !== 'A' && key !== 'B') return null;
  const clean = normProgram(program, key);
  if (!clean) return null;
  const { key: _key, ...body } = withAllDays({ ...clean, key });
  return { key, program: body };
}

/** Put program A or B back to the built-in one (the row is deleted). baseVersion is the version the user saw. */
export interface DeleteProgramInput {
  key: ProgKey;
}
export type DeleteProgramCommand = Command<'delete-program', DeleteProgramInput>;

export function validateDeleteProgram(input: unknown): DeleteProgramInput | null {
  if (!input || typeof input !== 'object') return null;
  const { key } = input as Record<string, unknown>;
  return key === 'A' || key === 'B' ? { key } : null;
}

/** Replace the whole settings document. There is one per user, so there is no key. */
export interface SaveConfigInput {
  config: ConfigDoc;
}
export type SaveConfigCommand = Command<'save-config', SaveConfigInput>;

export function validateSaveConfig(input: unknown): SaveConfigInput | null {
  if (!input || typeof input !== 'object') return null;
  const config = normConfigDoc((input as Record<string, unknown>).config);
  return config ? { config } : null;
}

/** Save one saved version of a program, keyed by the item's own id. baseVersion is the version the user saw, or null
 *  when the phone has never seen a row for that id. */
export interface SaveLibraryItemInput {
  item: LibraryItem;
}
export type SaveLibraryItemCommand = Command<'save-library-item', SaveLibraryItemInput>;

export function validateSaveLibraryItem(input: unknown): SaveLibraryItemInput | null {
  if (!input || typeof input !== 'object') return null;
  const [clean] = normLibrary([(input as Record<string, unknown>).item]);
  return clean ? { item: { ...clean, prog: withAllDays(clean.prog) } } : null;
}

/** Delete one saved version by id. baseVersion is the version the user saw (never null). */
export interface DeleteLibraryItemInput {
  id: string;
}
export type DeleteLibraryItemCommand = Command<'delete-library-item', DeleteLibraryItemInput>;

export function validateDeleteLibraryItem(input: unknown): DeleteLibraryItemInput | null {
  if (!input || typeof input !== 'object') return null;
  const { id } = input as Record<string, unknown>;
  return typeof id === 'string' && id && id.length <= LIMITS.text.id ? { id } : null;
}

/** The small lists that are one row per item, in the order they are shown. */
export const LIST_NAMES = ['stretch', 'stretch_experiment', 'experiment', 'supplement_item'] as const;
export type ListName = (typeof LIST_NAMES)[number];
export type ListItem = Stretch | StretchExperiment | Experiment | SupplementItem;

/** Save one item of a list, keyed by the list and the item's own id. `position` is where it sits in the list (0 is first);
 *  moving an item is a save of each item whose position changed. baseVersion is the version the user saw, or null when
 *  the phone has never seen a row for that id. */
export interface SaveListItemInput {
  list: ListName;
  item: ListItem;
  position: number;
}
export type SaveListItemCommand = Command<'save-list-item', SaveListItemInput>;

const LIST_ITEM_CLEANERS: Record<ListName, (x: unknown) => ListItem | null> = {
  stretch: normStretchItem,
  stretch_experiment: normStretchExperimentItem,
  experiment: normExperimentItem,
  supplement_item: x => normSupplementItem(x),
};
const validList = (v: unknown): v is ListName => LIST_NAMES.includes(v as ListName);
const validId = (v: unknown): v is string => typeof v === 'string' && v.length >= 1 && v.length <= LIMITS.text.id;

export function validateSaveListItem(input: unknown): SaveListItemInput | null {
  if (!input || typeof input !== 'object') return null;
  const { list, item, position } = input as Record<string, unknown>;
  if (!validList(list) || !Number.isInteger(position) || (position as number) < 0 || (position as number) > 9999) return null;
  const clean = LIST_ITEM_CLEANERS[list](item);
  return clean && validId(clean.id) ? { list, item: clean, position: position as number } : null;
}

/** Delete one item of a list by id. baseVersion is the version the user saw (never null). */
export interface DeleteListItemInput {
  list: ListName;
  id: string;
}
export type DeleteListItemCommand = Command<'delete-list-item', DeleteListItemInput>;

export function validateDeleteListItem(input: unknown): DeleteListItemInput | null {
  if (!input || typeof input !== 'object') return null;
  const { list, id } = input as Record<string, unknown>;
  return validList(list) && validId(id) ? { list, id } : null;
}
