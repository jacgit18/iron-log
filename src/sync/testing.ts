import type { DesiredRow, Mirror, MirrorRow } from './types.js';
import { idOfRow } from './rows.js';

/* Helpers for the sync tests: build a mirror the way the server would have filled it. */

let seq = 0;
export const asRow = (row: DesiredRow, over: { version?: number; deleted?: boolean; seq?: string } = {}): MirrorRow =>
  ({ ...row, version: over.version ?? 1, deleted: over.deleted ?? false, seq: over.seq ?? String(++seq) }) as MirrorRow;

export const mirrorOf = (rows: DesiredRow[], over: { version?: number } = {}): Map<string, MirrorRow> => new Map(rows.map(r => [idOfRow(r), asRow(r, over)]));

export const withRow = (mirror: Mirror, row: MirrorRow): Map<string, MirrorRow> => new Map(mirror).set(idOfRow(row), row);
