import { normConfigDoc, type ConfigDoc } from '../shared/config.js';
import { normExperimentItem, normStretchExperimentItem, normStretchItem, normSupplementItem } from '../shared/listItems.js';
import { validateSaveProgram, type ListName } from '../shared/commands.js';
import { normStretchWeek } from '../shared/stretchWeek.js';
import { normBoost, normTakenDay, normWaterDay, r1 } from '../shared/supplementDay.js';
import { SCHEMA_VERSION, normBody, normEntries, normLibrary, validDate, validGoal } from '../shared/validate.js';
import { normWeek } from '../shared/week.js';
import { padLibrary } from '../lib/data.js';
import { DEFAULT_GOAL_OZ } from '../lib/water.js';
import { entryId } from '../lib/export.js';
import type { LibraryItem, LogEntry, Supplements } from '../types.ts';
import { mirrorId, type DesiredRow, type Mirror, type MirrorRow } from './types.js';

/* ---------- Documents and rows ----------
   The app keeps whole documents under paths; the server keeps rows. This file is the map between them, in both
   directions, for every path the store uses:
     documentFor  — rows (the mirror) -> the document the store reads
     desiredRows  — the document the store wrote -> the rows it should be
     scopeRows    — the rows a path is responsible for (what to delete when the document no longer has them)
   Pure: no network, no storage. */

export type PathKind =
  | { kind: 'logs'; exerciseId: string }
  | { kind: 'weeks'; weekStart: string }
  | { kind: 'stretchweeks'; weekStart: string }
  | { kind: 'body' }
  | { kind: 'library' }
  | { kind: 'experiments' }
  | { kind: 'stretches' }
  | { kind: 'supplements' }
  | { kind: 'config' }
  | { kind: 'programs'; key: 'A' | 'B' };

/** The path kind for a store path, or null for a path that is not synced. */
export function parsePath(path: string): PathKind | null {
  const [head, rest, ...more] = path.split('/');
  if (more.length || !rest) return null;
  switch (head) {
    case 'logs': return rest.length <= 100 ? { kind: 'logs', exerciseId: rest } : null;
    case 'weeks': return validDate(rest) ? { kind: 'weeks', weekStart: rest } : null;
    case 'stretchweeks': return validDate(rest) ? { kind: 'stretchweeks', weekStart: rest } : null;
    case 'programs': return rest === 'A' || rest === 'B' ? { kind: 'programs', key: rest } : null;
    case 'body': case 'library': case 'experiments': case 'stretches': case 'supplements': case 'config':
      return rest === 'main' ? ({ kind: head } as PathKind) : null;
    default: return null;
  }
}

/** The document paths a row feeds, so the app can be told when a pulled row changes them. */
export function pathsOf(row: MirrorRow): string[] {
  switch (row.table) {
    case 'log_entries': return [`logs/${row.exerciseId}`];
    case 'body_entries': return ['body/main'];
    case 'weeks': return [`weeks/${row.key}`];
    case 'stretch_weeks': return [`stretchweeks/${row.key}`];
    case 'supplement_days': return ['supplements/main'];
    case 'programs': return [`programs/${row.key}`];
    case 'config': return ['config/main', 'supplements/main']; // the water goal and mode live in the config row
    case 'library_items': return ['library/main'];
    case 'list_items': return [row.list === 'experiment' ? 'experiments/main' : row.list === 'supplement_item' ? 'supplements/main' : 'stretches/main'];
  }
}

const WATER_KEYS = ['waterGoal', 'waterMode'] as const;
const rows = (mirror: Mirror) => [...mirror.values()];
const byKey = (a: { key: string }, b: { key: string }) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

// The rows a path is responsible for. The config row is shared by config/main and supplements/main, so neither owns it.
export function scopeRows(kind: PathKind, mirror: Mirror): MirrorRow[] {
  const all = rows(mirror);
  switch (kind.kind) {
    case 'logs': return all.filter(r => r.table === 'log_entries' && r.exerciseId === kind.exerciseId);
    case 'weeks': return all.filter(r => r.table === 'weeks' && r.key === kind.weekStart);
    case 'stretchweeks': return all.filter(r => r.table === 'stretch_weeks' && r.key === kind.weekStart);
    case 'body': return all.filter(r => r.table === 'body_entries');
    case 'library': return all.filter(r => r.table === 'library_items');
    case 'experiments': return all.filter(r => r.table === 'list_items' && r.list === 'experiment');
    case 'stretches': return all.filter(r => r.table === 'list_items' && (r.list === 'stretch' || r.list === 'stretch_experiment'));
    case 'supplements': return all.filter(r => r.table === 'supplement_days' || (r.table === 'list_items' && r.list === 'supplement_item'));
    case 'programs': return all.filter(r => r.table === 'programs' && r.key === kind.key);
    case 'config': return [];
  }
}

const configRow = (mirror: Mirror) => {
  const r = mirror.get(mirrorId('config', 'config'));
  return r && r.table === 'config' ? r : undefined;
};

const sortedLive = <T extends { key: string; seq: string }>(list: T[], order: (a: T, b: T) => number) => list.sort((a, b) => order(a, b) || byKey(a, b));

/* ---------- rows -> document ---------- */

/** The document the store reads for this path, or null when there is none (never saved, or removed). */
export function documentFor(kind: PathKind, mirror: Mirror): unknown {
  const scope = scopeRows(kind, mirror);
  const live = scope.filter(r => !r.deleted);
  switch (kind.kind) {
    case 'logs': {
      const entries = sortedLive(live.filter((r): r is Extract<MirrorRow, { table: 'log_entries' }> => r.table === 'log_entries'), (a, b) => a.entry.d.localeCompare(b.entry.d) || Number(BigInt(a.seq) - BigInt(b.seq)));
      return entries.length ? { schema: SCHEMA_VERSION, entries: entries.map(r => r.entry) } : null;
    }
    case 'weeks': { const r = live[0]; return r && r.table === 'weeks' ? r.week : null; }
    case 'stretchweeks': { const r = live[0]; return r && r.table === 'stretch_weeks' ? r.week : null; }
    case 'programs': { const r = live[0]; return r && r.table === 'programs' ? r.program : null; }
    case 'body': {
      if (!scope.length) return null;
      const entries = live.filter((r): r is Extract<MirrorRow, { table: 'body_entries' }> => r.table === 'body_entries').sort(byKey);
      return { schema: SCHEMA_VERSION, entries: entries.map(r => r.entry) };
    }
    case 'library': {
      if (!scope.length) return null;
      const items = sortedLive(live.filter((r): r is Extract<MirrorRow, { table: 'library_items' }> => r.table === 'library_items'), (a, b) => a.item.at.localeCompare(b.item.at) || Number(BigInt(a.seq) - BigInt(b.seq)));
      return { schema: SCHEMA_VERSION, items: items.map(r => r.item) };
    }
    case 'experiments': {
      if (!scope.length) return null;
      return { schema: SCHEMA_VERSION, items: listOf(live, 'experiment') };
    }
    case 'stretches': {
      if (!scope.length) return null;
      return { items: listOf(live, 'stretch'), experiments: listOf(live, 'stretch_experiment') };
    }
    case 'supplements': {
      const config = configRow(mirror);
      if (!scope.length && !(config && !config.deleted && WATER_KEYS.some(k => k in config.config))) return null;
      const doc: Supplements = {
        waterGoal: config && !config.deleted && validGoal(Number(config.config.waterGoal)) ? Number(config.config.waterGoal) : DEFAULT_GOAL_OZ,
        waterMode: config && !config.deleted && config.config.waterMode === 'fixed' ? 'fixed' : 'weight',
        water: {}, boost: {}, items: listOf(live, 'supplement_item') as Supplements['items'], taken: {},
      };
      for (const r of live) {
        if (r.table !== 'supplement_days') continue;
        if (r.record.water.length) doc.water[r.day] = r.record.water;
        if (r.record.boost) doc.boost[r.day] = r.record.boost;
        if (Object.keys(r.record.taken).length) doc.taken[r.day] = r.record.taken;
      }
      return doc;
    }
    case 'config': {
      const r = configRow(mirror);
      if (!r || r.deleted) return null;
      const { waterGoal: _g, waterMode: _m, ...rest } = r.config;
      return rest;
    }
  }
}

function listOf(live: MirrorRow[], list: ListName) {
  return live
    .filter((r): r is Extract<MirrorRow, { table: 'list_items' }> => r.table === 'list_items' && r.list === list)
    .sort((a, b) => a.position - b.position || byKey(a, b))
    .map(r => r.item);
}

/* ---------- document -> rows ---------- */

const withoutWater = (c: ConfigDoc): ConfigDoc => {
  const { waterGoal: _g, waterMode: _m, ...rest } = c;
  return rest;
};

/** The rows this path's document should be. A row the document no longer has is not listed; planning deletes it. */
export function desiredRows(kind: PathKind, doc: unknown, mirror: Mirror): DesiredRow[] {
  const d = (doc && typeof doc === 'object' ? doc : {}) as Record<string, unknown>;
  switch (kind.kind) {
    case 'logs': {
      const out = new Map<string, DesiredRow>();
      for (const e of normEntries(d.entries)) {
        const key = entryId(e);
        if (!out.has(key)) out.set(key, { table: 'log_entries', key, exerciseId: kind.exerciseId, entry: { ...e, id: key } });
      }
      return [...out.values()];
    }
    case 'weeks': return [{ table: 'weeks', key: kind.weekStart, week: normWeek(doc) }];
    case 'stretchweeks': return [{ table: 'stretch_weeks', key: kind.weekStart, week: normStretchWeek(doc) }];
    case 'programs': {
      const out = validateSaveProgram({ key: kind.key, program: doc });
      return out ? [{ table: 'programs', key: kind.key, progKey: kind.key, program: out.program }] : [];
    }
    case 'body': return normBody(d.entries).map(entry => ({ table: 'body_entries' as const, key: entry.wk, entry }));
    case 'library':
      return normLibrary(d.items).map((item: LibraryItem) => padLibrary([item])[0]!).map(item => ({ table: 'library_items' as const, key: item.id, item }));
    case 'experiments': return listRows('experiment', d.items, normExperimentItem);
    case 'stretches': return [...listRows('stretch', d.items, normStretchItem), ...listRows('stretch_experiment', d.experiments, normStretchExperimentItem)];
    case 'supplements': return supplementRows(d, mirror);
    case 'config': {
      const cfg = normConfigDoc(doc) ?? {};
      const row = configRow(mirror);
      const water = row && !row.deleted ? Object.fromEntries(WATER_KEYS.filter(k => k in row.config).map(k => [k, row.config[k]])) : {};
      // The config document never carries the water goal and mode (they live in the supplements document), so keep the server's.
      return [{ table: 'config', key: 'config', config: { ...withoutWater(cfg), ...water } }];
    }
  }
}

function listRows(list: ListName, items: unknown, clean: (x: unknown) => { id: string } | null): DesiredRow[] {
  const seen = new Set<string>();
  const out: DesiredRow[] = [];
  (Array.isArray(items) ? items : []).forEach(raw => {
    const item = clean(raw);
    if (!item || item.id.length > 100 || seen.has(item.id)) return;
    seen.add(item.id);
    out.push({ table: 'list_items', key: `${list}/${item.id}`, list, position: out.length, item: item as never });
  });
  return out;
}

function supplementRows(d: Record<string, unknown>, mirror: Mirror): DesiredRow[] {
  const out: DesiredRow[] = listRows('supplement_item', d.items, x => normSupplementItem(x));
  const water = (d.water && typeof d.water === 'object' ? d.water : {}) as Record<string, unknown>;
  const boost = (d.boost && typeof d.boost === 'object' ? d.boost : {}) as Record<string, unknown>;
  const taken = (d.taken && typeof d.taken === 'object' ? d.taken : {}) as Record<string, unknown>;
  const days = new Set([...Object.keys(water), ...Object.keys(boost), ...Object.keys(taken)].filter(validDate));
  [...days].sort().forEach(day => {
    const record = { water: normWaterDay(water[day]), boost: normBoost(boost[day]), taken: normTakenDay(taken[day]) };
    if (record.water.length || record.boost || Object.keys(record.taken).length) out.push({ table: 'supplement_days', key: day, day, record });
  });
  // The goal and mode ride in the config row, which config/main also writes. Only set what differs from the defaults
  // (or is already there), so a fresh account does not get a config row just for saving supplements.
  const base = configRow(mirror);
  const config: ConfigDoc = base && !base.deleted ? { ...base.config } : {};
  const goal = validGoal(Number(d.waterGoal)) ? r1(Number(d.waterGoal)) : DEFAULT_GOAL_OZ;
  const mode = d.waterMode === 'fixed' ? 'fixed' : 'weight';
  if (goal !== DEFAULT_GOAL_OZ || 'waterGoal' in config) config.waterGoal = goal; else delete config.waterGoal;
  if (mode !== 'weight' || 'waterMode' in config) config.waterMode = mode; else delete config.waterMode;
  if (base || Object.keys(config).length) out.push({ table: 'config', key: 'config', config });
  return out;
}

export type { LogEntry };
