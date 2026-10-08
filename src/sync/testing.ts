import type { DesiredRow, Mirror, MirrorRow } from './types.js';
import { idOfRow } from './rows.js';

/* Helpers for the sync tests: build a mirror the way the server would have filled it. */

let seq = 0;
export const asRow = (row: DesiredRow, over: { version?: number; deleted?: boolean; seq?: string } = {}): MirrorRow =>
  ({ ...row, version: over.version ?? 1, deleted: over.deleted ?? false, seq: over.seq ?? String(++seq) }) as MirrorRow;

export const mirrorOf = (rows: DesiredRow[], over: { version?: number } = {}): Map<string, MirrorRow> => new Map(rows.map(r => [idOfRow(r), asRow(r, over)]));

export const withRow = (mirror: Mirror, row: MirrorRow): Map<string, MirrorRow> => new Map(mirror).set(idOfRow(row), row);

/* A storage object that behaves like the browser's: values survive being written and read back as JSON. */
export function memoryStorage(refuseWrites = false) {
  const data = new Map<string, string>();
  return {
    data,
    refuse: refuseWrites,
    get(key: string): unknown { const v = data.get(key); return v === undefined ? null : JSON.parse(v); },
    set(key: string, value: unknown): boolean { if (this.refuse) return false; data.set(key, JSON.stringify(value)); return true; },
    remove(key: string) { data.delete(key); },
  };
}

/* A row as the API sends it, with the given fields on top of the usual ones. */
export const serverRow = (fields: object, over: { version?: number; seq?: string; deleted_at?: string | null } = {}) =>
  ({ id: '1', user_id: '1', version: 1, seq: '1', deleted_at: null, client_updated_at: null, schema_version: 1, ...fields, ...over }) as never;

export const logServerRow = (clientId: string, over: { version?: number; seq?: string; deleted_at?: string | null } = {}, fields: object = {}) =>
  serverRow({ client_id: clientId, exercise_id: 'squat', d: '2026-10-05', phase: 'strength', weight_lb: '135.0000', sets_count: 3, reps: '5.00', auto: false, ...fields }, over);
