import { normStretchWeek } from '../shared/stretchWeek.js';
import { normWeek } from '../shared/week.js';
import { canonOf, stable } from './canon.js';
import { desiredRows, documentFor, type PathKind } from './documents.js';
import { mergeStretchWeek3, mergeWeek3 } from './merge.js';
import { isDeleted } from './outbox.js';
import { mirrorId, type Mirror, type MirrorRow } from './types.js';

/* ---------- What this device changed itself (an erase on another device) ----------
   When a pull shows the account was erased on another device, this device's unsent and set-aside documents were made from the old
   data. Sending them whole would bring the erased history back (a log document holds every session of an exercise), but dropping
   them loses what was done here meanwhile, such as sessions logged offline. `ownChanges` keeps only what this device added or changed
   compared with its copy of the server rows from before the erase (`before`), as a document of its own, or null when there is nothing.
   A row the device removed is not kept: there is nothing left to remove. */
export function ownChanges(kind: PathKind, doc: unknown, before: Mirror): unknown | null {
  if (doc == null || isDeleted(doc)) return null;
  if (kind.kind === 'weeks' || kind.kind === 'stretchweeks') {
    // Key by key: a three-way merge against an empty week keeps the keys this device changed and drops the ones it left as they were.
    const empty = kind.kind === 'weeks' ? normWeek(null) : normStretchWeek(null);
    const prev = documentFor(kind, before) ?? empty;
    const own = kind.kind === 'weeks' ? mergeWeek3(prev, doc, empty).week : mergeStretchWeek3(prev, doc, empty).week;
    return stable(own) === stable(empty) ? null : own;
  }
  const mine = desiredRows(kind, doc, before).filter(r => {
    const had = before.get(mirrorId(r.table, r.key));
    return !had || had.deleted || canonOf(had) !== canonOf(r);
  });
  if (!mine.length) return null;
  const only = new Map(mine.map(r => [mirrorId(r.table, r.key), { ...r, version: 1, deleted: false, seq: '0' } as MirrorRow]));
  return documentFor(kind, only);
}
