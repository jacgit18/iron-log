/* ---------- CSV / Excel export, full data file, GitHub backup helpers ----------
   Every builder takes a state snapshot S = {cfg, logs, programs, library, body}. */
import { PHASES, PH_KEYS, BUILTIN, exInfo, withAllDays, DAY_COUNT } from './data.js';
import { ymd, fmtShort } from '../shared/dates.js';
import type { BackupCfg, DayDraft, Cfg, DataFile, LogEntry, Logs, PhaseKey, Program, Snapshot, Week } from '../types.ts';
import { DEFAULT_CFG, weekSlots, defaultPhase, normExperiments, setsOfEntry, setVal, rxOf, isItemDone, normWeek, colOf, progName, AUTO_NOTE } from './logic.js';

type XLSX = typeof import('xlsx');
type Row = (string | number | boolean | null | undefined)[];
const noteOf = (e: LogEntry) => e.n || (e.auto ? AUTO_NOTE : '');
import { MUSCLES, tagsOf, muscleNames } from './muscles.js';
import { WEEK_RE, weekOfDate, entryWeek, weekSummary } from './trends.js';
import { bwSorted } from './body.js';
import { normStretches, normStretchWeek, stretchWeekEmpty } from './stretches.js';
import { normSupplements } from './water.js';
import { validMode, validRest, validPct, validRm, validBodyLb, validLiftGoalLb, normEntries, normBody, normProgram, normLibrary, validStamp } from '../shared/validate.js';
import { validRepo } from './github.js';

// SheetJS is bundled (0.20.x, patched for reading untrusted files) and loaded only when needed.
export const loadXLSX = () => import('xlsx').catch(() => { throw new Error('Excel library failed to load'); });

export const phaseLabel = (p: string | null | undefined) => (p ? (PHASES[p as PhaseKey] ? PHASES[p as PhaseKey].label : '') : '');
const entryVolume = (e: LogEntry) => { if (e.sec) return ''; const v = setsOfEntry(e).reduce((a, x) => a + (Number(x.w) > 0 && Number(x.r) > 0 ? Number(x.w) * Number(x.r) : 0), 0); return v || ''; };
const setDetail = (e: LogEntry) => (Array.isArray(e.sets) && e.sets.length ? e.sets.map(x => `${x.w != null ? x.w : 'BW'}×${setVal(x)}`).join(', ') : '');

function csvCell(v: unknown) { const t = v == null ? '' : String(v); return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }
export function buildCsv(S: Snapshot) {
  const { cfg, logs } = S;
  const head = ['date', 'exercise', 'phase', 'weight_lb', 'sets', 'reps', 'hold_s', 'set_detail', 'primary_muscles', 'secondary_muscles', 'note', 'program_slot', 'week_of'];
  const rows: any[][] = [];
  Object.keys(logs).forEach(id => (logs[id] || []).forEach(e => rows.push([e.d, exInfo(cfg, id).n, phaseLabel(e.ph), e.w ?? '', e.s ?? '', e.r ?? '', e.sec ?? '', setDetail(e), muscleNames(cfg, id, 'p'), muscleNames(cfg, id, 's'), noteOf(e), e.slot || '', e.wk || ''])));
  rows.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  return [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
}

function sheet(X: XLSX, rows: Row[], widths: number[]) {
  const ws = X.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map(w => ({ wch: w }));
  if (rows.length > 1) ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }) };
  return ws;
}
function sessionRows(S: Snapshot, filter?: (e: LogEntry) => boolean): any[][] {
  const { cfg, logs } = S; const rows: any[][] = [];
  Object.keys(logs).forEach(id => (logs[id] || []).forEach(e => { if (!filter || filter(e)) rows.push([e.d, e.wk || weekOfDate(e.d), exInfo(cfg, id).n, phaseLabel(e.ph), e.w ?? '', e.s ?? '', e.sec ? '' : (e.r ?? ''), e.sec ?? '', setDetail(e), entryVolume(e), muscleNames(cfg, id, 'p'), muscleNames(cfg, id, 's'), noteOf(e), e.slot || '', id]); }));
  rows.sort((a, b) => (a[0] === b[0] ? a[2].localeCompare(b[2]) : a[0].localeCompare(b[0])));
  return [['Date', 'Week of', 'Exercise', 'Phase', 'Weight (lb)', 'Sets', 'Reps', 'Hold (s)', 'Set by set', 'Volume (lb)', 'Primary muscles', 'Secondary muscles', 'Note', 'Program slot', 'Exercise id'], ...rows];
}
const SESSION_COLS = [11, 11, 34, 13, 11, 6, 6, 9, 26, 12, 28, 28, 30, 14, 16];

export function buildOverallWorkbook(X: XLSX, S: Snapshot, weeks: Record<string, Week>) {
  const { cfg, logs, programs, body } = S; const wb = X.utils.book_new();
  const sum: Row[] = [['Exercise', 'Latest phase', 'Sessions', 'First logged', 'Last logged', 'First weight (lb)', 'Latest weight (lb)', 'Best weight (lb)', 'Change (lb)', '1RM (lb)']];
  Object.keys(logs).filter(id => logs[id].length).sort((a, b) => exInfo(cfg, a).n.localeCompare(exInfo(cfg, b).n)).forEach(id => {
    const L = logs[id], last = L[L.length - 1];
    const ws = L.filter(e => (e.ph || null) === (last.ph || null) && Number(e.w) > 0).map(e => Number(e.w));
    const first = ws.length ? ws[0] : '', latest = ws.length ? ws[ws.length - 1] : '';
    sum.push([exInfo(cfg, id).n, phaseLabel(last.ph), L.length, L[0].d, last.d, first, latest, ws.length ? Math.max(...ws) : '', ws.length ? (latest as number) - (first as number) : '', cfg.rm[id] ?? '']);
  });
  X.utils.book_append_sheet(wb, sheet(X, sum, [34, 13, 9, 12, 12, 15, 16, 15, 11, 9]), 'Summary');
  X.utils.book_append_sheet(wb, sheet(X, sessionRows(S), SESSION_COLS), 'Sessions');
  // Logged sets per muscle per week (secondary work counts half)
  const mv: Record<string, { k: string; m: string; p: number; s: number }> = {};
  Object.keys(logs).forEach(id => {
    const t = tagsOf(cfg, id); if (!t || t.mob) return;
    (logs[id] || []).forEach(e => {
      const k = entryWeek(e); const sets = Number(e.s) || 0; if (!sets) return;
      (['p', 's'] as const).forEach(role => (t[role] || []).forEach(m => { const key = k + '|' + m; const r = mv[key] = mv[key] || { k, m, p: 0, s: 0 }; r[role] += sets; }));
    });
  });
  const mus: Row[] = [['Week of', 'Muscle', 'Primary sets', 'Secondary sets', 'Weighted sets']];
  Object.values(mv).sort((a, b) => (a.k === b.k ? (b.p + b.s / 2) - (a.p + a.s / 2) : a.k.localeCompare(b.k))).forEach(r => mus.push([r.k, (MUSCLES as Record<string, { n: string }>)[r.m] ? (MUSCLES as Record<string, { n: string }>)[r.m].n : r.m, r.p, r.s, r.p + r.s / 2]));
  X.utils.book_append_sheet(wb, sheet(X, mus, [12, 24, 13, 15, 14]), 'Muscles');
  const wk: Row[] = [['Week of', 'Program', 'Days complete', 'Exercises done', 'Exercises planned', 'Skipped', '% done', 'Sessions logged']];
  Object.keys(weeks).filter(k => WEEK_RE.test(k)).sort().forEach(k => {
    const r = weekSummary(cfg, programs, k, weeks[k]); const n = Object.values(logs).reduce((a, L) => a + L.filter(e => entryWeek(e) === k).length, 0);
    if (r.ex || n || r.skipped) wk.push([k, r.pk, r.full, r.ex, r.total, r.skipped, r.total ? Math.round(r.ex / r.total * 100) : 0, n]);
  });
  X.utils.book_append_sheet(wb, sheet(X, wk, [12, 9, 14, 15, 17, 9, 8, 15]), 'Weeks');
  const bwl = bwSorted(body); const bws: Row[] = [['Week of', 'Date', 'Body weight (lb)', 'Change (lb)']];
  bwl.forEach((e, i) => bws.push([e.wk, e.d, e.w, i ? Math.round((e.w - bwl[i - 1].w) * 10) / 10 : '']));
  X.utils.book_append_sheet(wb, sheet(X, bws, [12, 12, 17, 12]), 'Body weight');
  const st: Row[] = [['Setting', 'Value'], ['Mode', cfg.mode], ['Rest between sets (s)', cfg.rest ?? 90], ['Program A name', progName(cfg, 'A')], ['Program B name', progName(cfg, 'B')]];
  PH_KEYS.forEach(p => st.push([`${PHASES[p].label} % of 1RM`, cfg.pct[p] ?? PHASES[p].pct]));
  Object.keys(cfg.rm).sort().forEach(id => st.push([`1RM: ${exInfo(cfg, id).n}`, cfg.rm[id]]));
  st.push(['Exported', new Date().toISOString()]);
  X.utils.book_append_sheet(wb, sheet(X, st, [34, 24]), 'Settings');
  addDataSheets(X, wb, S, weeks);
  return wb;
}

/* ---------- Data sheets: what the workbook holds beyond the readable report, so it imports back whole ---------- */
export const PROG_HEAD = ['Program', 'Day', 'Day title', 'Day subtitle', 'Make-up day', 'Slot #', 'Slot id', 'Section', 'Tier', 'Type', 'Slot note', 'Exercise id', 'Exercise', 'Phase', 'Weight (lb)', 'Bodyweight', 'Rx', 'Item note'];
const dayCells = (d: { title?: string; sub?: string; makeup?: boolean }) => [d.title ?? '', d.sub ?? '', d.makeup ? 'Yes' : ''];
export function programRows(cfg: Cfg, owner: string, prog: { days: DayDraft[] }) {
  const rows: Row[] = [];
  prog.days.forEach((d, di) => {
    if (!d.slots.length) rows.push([owner, di + 1, ...dayCells(d), '', '', '', '', '', '', '', '', '', '', '', '', '']);
    d.slots.forEach((s, si) => {
      const base = [owner, di + 1, ...dayCells(d), si + 1, s.id ?? '', s.sec ?? '', s.tier ?? '', s.type ?? '', s.note ?? ''];
      if (!s.items.length) rows.push([...base, '', '', '', '', '', '', '']);
      s.items.forEach(it => rows.push([...base, it.ex, exInfo(cfg, it.ex).n, it.ph ?? '', it.w ?? '', it.bw ? 'Yes' : '', it.rx ?? '', it.note ?? '']));
    });
  });
  return rows;
}
export const CHECK_HEAD = ['Week of', 'Kind', 'Key', 'Value'];
export function checkRows(weeks: Record<string, Week>) {
  const rows: Row[] = [];
  Object.keys(weeks).filter(k => WEEK_RE.test(k)).sort().forEach(k => {
    const w = normWeek(weeks[k]);
    if (w.prog) rows.push([k, 'prog', '', w.prog]);
    if (w.rest) rows.push([k, 'rest', '', w.rest.join(' ')]);
    if (w.restOn) rows.push([k, 'restOn', '', w.restOn]);
    if (w.order) rows.push([k, 'order', '', w.order.join(' ')]);
    (w.extra || []).forEach(x => rows.push([k, 'extra', x.id, JSON.stringify(x)]));
    (['done', 'skipped'] as const).forEach(kind => Object.keys(w[kind]).forEach(id => { if (w[kind][id]) rows.push([k, kind, id, 'Yes']); }));
    Object.entries(w.moved).forEach(([id, day]) => rows.push([k, 'moved', id, day]));
    Object.entries(w.ph).forEach(([id, ph]) => rows.push([k, 'phase', id, ph]));
    Object.entries(w.warm).forEach(([day, o]) => Object.entries(o).forEach(([item, v]) => rows.push([k, 'warm', `${day}/${item}`, v ? 'Yes' : 'No'])));
  });
  return rows;
}
function addDataSheets(X: XLSX, wb: ReturnType<XLSX['utils']['book_new']>, S: Snapshot, weeks: Record<string, Week>) {
  const { cfg, programs, library, experiments } = S;
  const prow: Row[] = [], info: Row[] = [['Program', 'Warm-up']];
  (['A', 'B'] as const).forEach(k => { if (programs[k] !== BUILTIN[k]) { prow.push(...programRows(cfg, k, programs[k])); info.push([k, programs[k].warm ?? '']); } });
  library.forEach(it => { prow.push(...programRows(cfg, it.id, it.prog)); info.push([it.id, it.prog.warm ?? '']); });
  X.utils.book_append_sheet(wb, sheet(X, [PROG_HEAD, ...prow], [10, 5, 12, 26, 10, 7, 12, 11, 10, 9, 24, 14, 30, 11, 11, 10, 16, 24]), 'Programs');
  X.utils.book_append_sheet(wb, sheet(X, info, [12, 40]), 'Program info');
  X.utils.book_append_sheet(wb, sheet(X, [['Id', 'Name', 'From', 'Saved at', 'Auto-saved', 'Created'], ...library.map(it => [it.id, it.name, it.from ?? '', it.at ?? '', it.auto ? 'Yes' : '', it.created ? 'Yes' : ''])], [14, 36, 7, 26, 11, 9]), 'Saved versions');
  X.utils.book_append_sheet(wb, sheet(X, [['Id', 'Exercise id', 'Exercise', 'Phase', 'Note'], ...(experiments || []).map(e => [e.id, e.ex, exInfo(cfg, e.ex).n, e.ph ?? '', e.note ?? ''])], [14, 16, 30, 11, 40]), 'Experiments');
  X.utils.book_append_sheet(wb, sheet(X, [CHECK_HEAD, ...checkRows(weeks)], [12, 9, 24, 12]), 'Check-offs');
  X.utils.book_append_sheet(wb, sheet(X, [['Setting', 'Value (JSON)'], ...Object.keys(cfg).sort().map(k => [k, JSON.stringify((cfg as any)[k])])], [18, 60]), 'Config');
}

export function buildWeekWorkbook(X: XLSX, S: Snapshot, key: string, w: Week) {
  const { cfg, programs } = S; const wb = X.utils.book_new();
  const r = weekSummary(cfg, programs, key, w);
  const slots = weekSlots(programs[r.pk] || programs.A, w);
  const n = sessionRows(S, e => entryWeek(e) === key);
  X.utils.book_append_sheet(wb, sheet(X, [
    ['Week of', key], ['Program', r.pk], ['Days complete', `${r.full} of ${DAY_COUNT}`], ['Exercises done', `${r.ex} of ${r.total}`], ['Skipped', r.skipped], ['Sessions logged', n.length - 1],
  ], [18, 14]), 'Summary');
  const plan: Row[] = [['Planned day', 'Done on day', 'Section', 'Tier', 'Type', 'Exercise', 'Phase', 'Sets × reps', 'Program weight (lb)', 'Done']];
  const nw = normWeek(w);
  slots.forEach(s => s.items.forEach((it, idx) => {
    const ph = (w.ph && w.ph[`${s.id}:${idx}`]) ?? defaultPhase(cfg, s, idx);
    const moved = w.moved && w.moved[s.id];
    plan.push([colOf(nw, s.day), colOf(nw, moved || s.day), s.sec || '', s.tier || '', s.type === 'single' ? '' : s.type, exInfo(cfg, it.ex).n, phaseLabel(ph), rxOf(cfg, it, ph), it.w ?? (it.bw ? 'BW' : ''), (w.skipped && w.skipped[s.id]) ? 'Skipped' : isItemDone(s, idx, nw) ? 'Yes' : 'No']);
  }));
  X.utils.book_append_sheet(wb, sheet(X, plan, [11, 11, 11, 10, 9, 34, 13, 16, 18, 6]), 'Plan');
  X.utils.book_append_sheet(wb, sheet(X, n, SESSION_COLS), 'Logged');
  return wb;
}

/* ---------- Programs in the library ---------- */
export const progBody = <T extends { key?: unknown }>(p: T): Omit<T, 'key'> => { const { key: _key, ...b } = structuredClone(p); return b; }; // eslint-disable-line no-unused-vars
export const sameProg = (a: { key?: unknown }, b: { key?: unknown }) => JSON.stringify(progBody(a)) === JSON.stringify(progBody(b));
export const libDate = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : `${fmtShort(d)}, ${d.getFullYear()}`; };

/* ---------- Full data file (JSON) ---------- */
export const DATA_FORMAT = 1;
export function utf8b64(s: string) { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000) as unknown as number[]); return btoa(bin); }
export function buildDataFile(S: Snapshot, weeks: Record<string, Week>) {
  const { cfg, logs, programs, library, body } = S; const W: Record<string, Week> = {};
  Object.keys(weeks).filter(k => WEEK_RE.test(k)).sort().forEach(k => { const w = normWeek(weeks[k]); if (w.prog || w.rest || w.order || w.extra || [w.done, w.skipped, w.moved, w.ph, w.warm].some(o => Object.keys(o).length)) W[k] = w; });
  const P: Record<string, Omit<Program, 'key'>> = {}; (['A', 'B'] as const).forEach(k => { if (programs[k] !== BUILTIN[k]) P[k] = progBody(programs[k]); });
  const L: Logs = {}; Object.keys(logs).sort().forEach(id => { if (logs[id] && logs[id].length) L[id] = logs[id]; });
  return { app: 'iron-log', format: DATA_FORMAT, exportedAt: new Date().toISOString(), config: structuredClone(cfg), programs: P, library: structuredClone(library), logs: L, weeks: W, body: bwSorted(body), experiments: normExperiments(S.experiments), ...wellnessOut(S) };
}
// Stretches (library, experiments, weekly check-offs) and supplements (water). Left out when the snapshot has none, so older files read the same.
function wellnessOut(S: Snapshot) {
  if (!S.stretches) return {};
  const SW: Record<string, ReturnType<typeof normStretchWeek>> = {}; Object.keys(S.stretchWeeks || {}).filter(k => WEEK_RE.test(k)).sort().forEach(k => { const w = normStretchWeek(S.stretchWeeks![k]); if (!stretchWeekEmpty(w)) SW[k] = w; });
  return { stretches: { items: structuredClone(S.stretches), experiments: structuredClone(S.stretchExps || []) }, stretchWeeks: SW, supplements: normSupplements(S.supp) };
}
export function dataStats(d: Partial<DataFile>) {
  const L = Object.values(d.logs || {}); const sets = L.reduce((a, l) => a + l.length, 0);
  return { entries: sets, exercises: L.filter(l => l.length).length, weeks: Object.keys(d.weeks || {}).length, programs: Object.keys(d.programs || {}), saved: (d.library || []).length, body: (d.body || []).length, experiments: (d.experiments || []).length, stretches: d.stretches ? d.stretches.items.length : 0, stretchWeeks: Object.keys(d.stretchWeeks || {}).length, waterDays: d.supplements ? Object.keys(d.supplements.water).length : 0 };
}
export function parseDataFile(text: string): DataFile {
  let d: any; try { d = JSON.parse(text); } catch { throw new Error('That file isn’t valid JSON.'); }
  if (!d || d.app !== 'iron-log') throw new Error('That isn’t an Iron Log data file.');
  if (!(d.format >= 1)) throw new Error('Unknown file format.');
  if (d.format > DATA_FORMAT) throw new Error('This file is from a newer version of Iron Log. Update the app first.');
  return normalizeData(d);
}
// The config from a file: the keys the app reads as plain objects must be plain objects, or it would throw on every load.
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
const CFG_OBJECTS = ['muscleMap', 'ex', 'pct', 'rxOverride', 'rm', 'phDef', 'exPh', 'progNames', 'liftGoals'];
export function normConfig(c: any): Partial<Cfg> {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return {};
  const out: any = { ...c };
  CFG_OBJECTS.forEach(k => { if (k in out && (!out[k] || typeof out[k] !== 'object' || Array.isArray(out[k]))) delete out[k]; });
  if ('mode' in out && !validMode(out.mode)) delete out.mode;
  if ('rest' in out && !validRest(out.rest)) delete out.rest;
  const own = (o: any, f: (k: string, v: any) => unknown) => { const r: Record<string, unknown> = {}; Object.entries(o).forEach(([k, v]) => { if (!UNSAFE.has(k)) { const x = f(k, v); if (x !== undefined) r[k] = x; } }); return r; };
  if (out.pct) out.pct = { ...DEFAULT_CFG.pct, ...own(out.pct, (k, v) => (typeof v === 'number' && validPct(v) ? v : undefined)) };
  if (out.rm) out.rm = own(out.rm, (k, v) => (typeof v === 'number' && validRm(v) ? v : undefined));
  if (out.liftGoals) out.liftGoals = own(out.liftGoals, (k, byKey) => (byKey && typeof byKey === 'object' && !Array.isArray(byKey) ? own(byKey, (_k, g) => (g && typeof g === 'object' && typeof g.w === 'number' && validLiftGoalLb(g.w) ? g : undefined)) : undefined));
  if ('bwGoal' in out && !(out.bwGoal && typeof out.bwGoal === 'object' && typeof out.bwGoal.w === 'number' && validBodyLb(out.bwGoal.w))) delete out.bwGoal;
  if ('backup' in out && !(out.backup && typeof out.backup === 'object' && validRepo(out.backup.repo))) delete out.backup;
  return out;
}
// Checks and cleans a data-file-shaped object. Used for both the JSON file and a full Excel workbook.
export function normalizeData(d: any): DataFile {
  const out: DataFile = { exportedAt: d.exportedAt, config: normConfig(d.config), programs: {}, library: [], logs: {}, weeks: {}, body: [], experiments: normExperiments(d.experiments), stretches: d.stretches ? normStretches(d.stretches) : null, stretchWeeks: {}, supplements: d.supplements ? normSupplements(d.supplements) : null };
  Object.entries(d.stretchWeeks || {}).forEach(([k, w]) => { if (WEEK_RE.test(k)) { const n = normStretchWeek(w); if (!stretchWeekEmpty(n)) out.stretchWeeks[k] = n; } });
  out.body = normBody(d.body);
  (['A', 'B'] as const).forEach(k => { const p = normProgram(d.programs && d.programs[k], k); if (p) out.programs[k] = progBody(withAllDays({ ...p, key: k })); });
  normLibrary(d.library).forEach(it => out.library.push({ ...it, prog: withAllDays(it.prog) }));
  Object.entries(d.logs || {}).forEach(([id, l]) => { if (id !== '__proto__' && /^[\w.~:@+-]{1,200}$/.test(id) && Array.isArray(l)) { const ok = normEntries(l); if (ok.length) out.logs[id] = ok; } });
  Object.entries(d.weeks || {}).forEach(([k, w]) => { if (WEEK_RE.test(k) && w && typeof w === 'object') out.weeks[k] = normWeek(w); });
  return out;
}
// Import choices follow the app's tabs. Board: check-offs, body weight, exercises to try. Progress: logged sessions.
// Muscles: muscle tags. Program: edited programs, saved versions, custom exercises. Settings: everything else in the config.
export const IMPORT_SECTIONS = [['board', 'Board'], ['progress', 'Progress'], ['muscles', 'Muscles'], ['program', 'Program'], ['stretches', 'Stretches'], ['supplements', 'Supplements'], ['settings', 'Settings']];
export const importSel = (draft: { sel?: Record<string, boolean> }) => Object.fromEntries(IMPORT_SECTIONS.map(([k]) => [k, !draft.sel || draft.sel[k] !== false]));
export const cfgSection = (k: string) => (k === 'muscleMap' ? 'muscles' : ['ex', 'progNames', 'phDef', 'exPh'].includes(k) ? 'program' : 'settings');
/* ---------- Which logged sessions are the same one ----------
   An entry's values in a fixed field order, so the same session matches however its fields were written (a workbook
   rebuilds entries in another key order). The id is left out, and a stored `wk` that is just the week of the date
   carries no information. */
const kv = (v: unknown) => (v === '' || v == null ? null : Number(v));
export const sameKey = (e: LogEntry) => JSON.stringify([e.d, e.ph || null, kv(e.w), kv(e.s), kv(e.r), kv(e.sec),
  Array.isArray(e.sets) && e.sets.length ? e.sets.map(x => [kv(x.w), kv(x.r), kv(x.sec)]) : null,
  e.n || null, !!e.auto, e.slot || null, e.wk && e.wk !== weekOfDate(e.d) ? e.wk : null]);
const hash = (t: string) => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; return h.toString(36); };
// An entry's identity: its id, or for one saved before entries had ids, a hash of its values. Editing such an entry
// stores that hash as its id, so an older copy of it (from a backup) is still known as the same session.
export const entryId = (e: LogEntry) => e.id || 'k' + hash(sameKey(e));
// Where `target` (an entry as it was read) is in list L now, or -1 if it is gone or changed meanwhile.
export const findEntry = (L: LogEntry[], target: LogEntry) => (target.id ? L.findIndex(x => x.id === target.id) : L.findIndex(x => !x.id && sameKey(x) === sameKey(target)));
// Adds b's entries that a doesn't have. A check-off (auto) entry is one per card and week: it isn't added next to
// any entry for that card and week, and a session logged by hand replaces it, as on the board.
// Same id on both sides: this device's copy stays, unless both carry an updatedAt and the incoming one is later (it was edited
// after this one), in which case it replaces it. Copies without a timestamp (older data, Excel files) never replace anything.
export function mergeEntries(a: LogEntry[], b: LogEntry[]) {
  let out = [...a]; const ids = new Set(a.map(entryId)); const keys = new Set(a.map(sameKey));
  b.forEach(e => {
    const id = entryId(e);
    if (ids.has(id)) {
      const i = out.findIndex(x => entryId(x) === id);
      if (i >= 0 && newer(e, out[i])) { out[i] = { ...e, id }; keys.add(sameKey(e)); }
      return;
    }
    if (keys.has(sameKey(e))) return;
    const card = (x: LogEntry) => !!(e.slot && e.wk) && x.slot === e.slot && x.wk === e.wk;
    if (e.auto && out.some(card)) return;
    if (!e.auto) out = out.filter(x => !(x.auto && card(x)));
    out.push(e); ids.add(id); keys.add(sameKey(e));
  });
  return out.sort((x, y) => x.d.localeCompare(y.d));
}
const newer = (x: LogEntry, y: LogEntry) => validStamp(x.updatedAt) && validStamp(y.updatedAt) && Date.parse(x.updatedAt) > Date.parse(y.updatedAt);
export function mergeWeek(a: unknown, b: unknown): Week {
  const w = normWeek(a); const o = normWeek(b);
  w.prog = w.prog || o.prog;
  if (!w.rest && o.rest) w.rest = o.rest;
  if (w.rest && !w.restOn && o.restOn && JSON.stringify(o.rest) === JSON.stringify(w.rest)) w.restOn = o.restOn;
  if (!w.order && o.order) w.order = o.order;
  (['moved', 'ph'] as const).forEach(k => { (w as any)[k] = { ...o[k], ...w[k] }; });
  Object.keys(o.warm).forEach(d => { w.warm[d] = { ...o.warm[d], ...(w.warm[d] || {}) }; });
  const have = new Set((w.extra || []).map(x => x.id)); const more = (o.extra || []).filter(x => !have.has(x.id)); if (more.length) w.extra = [...(w.extra || []), ...more];
  w.done = { ...o.done, ...w.done }; w.skipped = { ...o.skipped, ...w.skipped }; Object.keys(w.done).forEach(id => delete w.skipped[id]);
  return w;
}

/* ---------- GitHub backup (Claude-hosted version, via the viewer's Composio connector) ---------- */
export const GH_SERVER = 'Composio For You';
export const GH_TOOL = 'COMPOSIO_MULTI_EXECUTE_TOOL';
export const backupCfg = (cfg: Cfg): BackupCfg => ({ repo: 'jacgit18/iron-log-data', branch: 'main', hashes: {}, ...(cfg.backup || {}) });
function hashStr(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
export function weekFingerprint(S: Snapshot, key: string, w: Week) {
  const { cfg, logs, programs } = S;
  const L = Object.keys(logs).sort().map(id => [id, (logs[id] || []).filter(e => entryWeek(e) === key)]);
  const nw = normWeek(w);
  return hashStr(JSON.stringify([w.done, w.skipped, w.moved, w.ph, w.prog, nw.rest, nw.order, nw.restOn, nw.extra, L, programs[weekSummary(cfg, programs, key, w).pk]]));
}
export function backupError(e: { code?: string; message?: string } | null | undefined) {
  const c = e && e.code;
  if (c === 'server_not_connected' || c === 'selection_required') return 'Add or pick the Composio connector in claude.ai Settings → Connectors, then try again.';
  if (c === 'needs_reauth') return 'Reconnect Composio in claude.ai Settings → Connectors, then try again.';
  if (c === 'not_in_manifest') return 'GitHub access isn’t allowed for this page. Allow the connector when asked, or turn it back on in the page’s connector settings.';
  if (c === 'blocked_by_policy' || c === 'approval_required') return 'Your organization’s settings block this connector here.';
  if (c === 'server_unavailable' || c === 'upstream_error' || c === 'cancelled') return 'GitHub didn’t answer in time. The backup may still have gone through, so check the repo before trying again.';
  if (c === 'not_granted' || c === 'capability_disabled' || c === 'capability_removed') return 'GitHub backup isn’t available in this view.';
  return (e && e.message) ? e.message : 'Backup failed.';
}
export const daysSince = (last: { at: string } | null | undefined) => (last ? Math.floor((Date.now() - new Date(last.at).getTime()) / 864e5) : null);
export const daysSinceBackup = (cfg: Cfg) => daysSince(cfg.backup && cfg.backup.last);

/* ---------- GitHub backup (standalone app: GitHub REST API with the viewer's token) ---------- */
export const ghCfg = (cfg: Cfg) => ({ repo: 'jacgit18/iron-log', branch: 'data', ...(cfg.ghBackup || {}) });
// Same value for the same data, whenever it was exported and whatever the backup bookkeeping says.
export function dataFingerprint(d: Partial<DataFile>) {
  const { backup: _b, ghBackup: _g, ...config } = { ...d.config }; // eslint-disable-line no-unused-vars
  return hashStr(JSON.stringify({ ...d, exportedAt: null, config }));
}
export const todayStamp = () => ymd(new Date());
