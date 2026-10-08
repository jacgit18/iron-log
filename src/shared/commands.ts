/* ---------- Command contract (ADR 008) ----------
   One module for what the phone sends and the API accepts. Each command has a name, an input type and a validator;
   the offline queue stores a Command and replays it unchanged. Framework-free: client and server import it. */

import type { BodyEntry, Boost, LogEntry, StretchWeek, Week } from '../types.ts';
import { LIMITS, normBody, normEntry, validDate } from './validate.js';
import { normStretchWeek } from './stretchWeek.js';
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
