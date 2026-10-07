/* ---------- Command contract (ADR 008) ----------
   One module for what the phone sends and the API accepts. Each command has a name, an input type and a validator;
   the offline queue stores a Command and replays it unchanged. Framework-free: client and server import it. */

import type { LogEntry } from '../types.ts';
import { LIMITS, normEntry, validDate } from './validate.js';

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
