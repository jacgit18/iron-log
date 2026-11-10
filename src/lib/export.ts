/* ---------- CSV / Excel export, full data file ----------
   Every builder takes a state snapshot S = {cfg, logs, programs, library, body}. */
import { PHASES, PH_KEYS, BUILTIN, exInfo, withAllDays, DAY_COUNT } from './data.js';
import { shownNote } from './exerciseNote.js';
import { ymd } from '../shared/dates.js';
import type { DayDraft, Cfg, DataFile, LogEntry, Logs, PhaseKey, Program, Snapshot, Week } from '../types.ts';
import { weekSlots, weekProgram, defaultPhase, normExperiments, setsOfEntry, setVal, rxOf, isItemDone, isItemSkipped, isSkipped, normWeek, colOf, progName, AUTO_NOTE } from './logic.js';

type XLSX = typeof import('xlsx');
type Row = (string | number | boolean | null | undefined)[];
const noteOf = (e: LogEntry) => e.n || (e.auto ? AUTO_NOTE : '');
import { MUSCLES, tagsOf, muscleNames } from './muscles.js';
import { WEEK_RE, weekOfDate, entryWeek, weekSummary } from './trends.js';
import { bwSorted } from './body.js';
import { normStretches, normStretchWeek, stretchWeekEmpty } from './stretches.js';
import { normSupplements } from './water.js';
import { normGroceryData } from './grocery.js';
import { normDietEntries } from '../shared/diet.js';
import { normRecipes } from '../shared/recipes.js';
import { normEntries, normBody, normProgram, normLibrary } from '../shared/validate.js';
import { normConfig } from '../shared/config.js';
import { nameCmp } from './sort.js';

export { normConfig };
export * from './entryMerge.js';
import { progBody } from './entryMerge.js';

// SheetJS is bundled (0.20.x, patched for reading untrusted files) and loaded only when needed.
export const loadXLSX = () => import('xlsx').catch(() => { throw new Error('Excel library failed to load'); });

export const phaseLabel = (p: string | null | undefined) => (p ? (PHASES[p as PhaseKey] ? PHASES[p as PhaseKey].label : '') : '');
const entryVolume = (e: LogEntry) => { if (e.sec) return ''; const v = setsOfEntry(e).reduce((a, x) => a + (Number(x.w) > 0 && Number(x.r) > 0 ? Number(x.w) * Number(x.r) : 0), 0); return v || ''; };
const setDetail = (e: LogEntry) => (Array.isArray(e.sets) && e.sets.length ? e.sets.map(x => `${x.w != null ? x.w : 'BW'}×${setVal(x)}`).join(', ') : '');

// A text cell that starts with = + - @ tab or CR runs as a formula in Excel; a leading ' makes it text (also in front of a value that already starts with ' and then one of them, which the importer strips just once). Numbers are left alone, so a negative weight stays a number.
function csvCell(v: unknown) { let t = v == null ? '' : String(v); if (typeof v === 'string' && /^'*[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }
export function buildCsv(S: Snapshot) {
  const { cfg, logs } = S;
  const head = ['date', 'exercise', 'phase', 'weight_lb', 'sets', 'reps', 'hold_s', 'set_detail', 'primary_muscles', 'secondary_muscles', 'note', 'program_slot', 'week_of'];
  const rows: any[][] = [];
  Object.keys(logs).forEach(id => (logs[id] || []).forEach(e => rows.push([e.d, exInfo(cfg, id).n, phaseLabel(e.ph), e.w ?? '', e.s ?? '', e.r ?? '', e.sec ?? '', setDetail(e), muscleNames(cfg, id, 'p'), muscleNames(cfg, id, 's'), noteOf(e), e.slot || '', e.wk || ''])));
  rows.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0]))); // sort-ok: export rows keep their sheet order
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
  rows.sort((a, b) => (a[0] === b[0] ? a[2].localeCompare(b[2]) : a[0].localeCompare(b[0]))); // sort-ok: export rows keep their sheet order
  return [['Date', 'Week of', 'Exercise', 'Phase', 'Weight (lb)', 'Sets', 'Reps', 'Hold (s)', 'Set by set', 'Volume (lb)', 'Primary muscles', 'Secondary muscles', 'Note', 'Program slot', 'Exercise id'], ...rows];
}
const SESSION_COLS = [11, 11, 34, 13, 11, 6, 6, 9, 26, 12, 28, 28, 30, 14, 16];

export function buildOverallWorkbook(X: XLSX, S: Snapshot, weeks: Record<string, Week>) {
  const { cfg, logs, programs, body } = S; const wb = X.utils.book_new();
  const sum: Row[] = [['Exercise', 'Latest phase', 'Sessions', 'First logged', 'Last logged', 'First weight (lb)', 'Latest weight (lb)', 'Best weight (lb)', 'Change (lb)', '1RM (lb)']];
  Object.keys(logs).filter(id => logs[id].length).sort(nameCmp(id => exInfo(cfg, id).n, id => id)).forEach(id => {
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
  Object.values(mv).sort((a, b) => (a.k === b.k ? (b.p + b.s / 2) - (a.p + a.s / 2) : a.k.localeCompare(b.k))).forEach(r => mus.push([r.k, (MUSCLES as Record<string, { n: string }>)[r.m] ? (MUSCLES as Record<string, { n: string }>)[r.m].n : r.m, r.p, r.s, r.p + r.s / 2])); // sort-ok: export rows keep their sheet order
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
      s.items.forEach(it => rows.push([...base, it.ex, exInfo(cfg, it.ex).n, it.ph ?? '', it.w ?? '', it.bw ? 'Yes' : '', it.rx ?? '', shownNote(cfg, it.ex, it.note)]));
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
    if (w.ran) rows.push([k, 'ran', '', w.ran.prog]); // its cards are on the Programs sheet as program `ran:<week>`
    if (w.rest) rows.push([k, 'rest', '', w.rest.join(' ')]);
    if (w.restOn) Object.entries(w.restOn).forEach(([col, date]) => rows.push([k, 'restOn', col, date])); // one row per rest day, the column in the key
    if (w.order) rows.push([k, 'order', '', w.order.join(' ')]);
    (w.extra || []).forEach(x => rows.push([k, 'extra', x.id, JSON.stringify(x)]));
    (w.split || []).forEach(x => rows.push([k, 'split', x.id, JSON.stringify(x)]));
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
  // What each week ran (ADR 022), as program `ran:<week>`; the Check-offs sheet names which program it was.
  Object.keys(weeks).filter(k => WEEK_RE.test(k)).sort().forEach(k => { const r = normWeek(weeks[k]).ran; if (r) { prow.push(...programRows(cfg, `ran:${k}`, r.program)); info.push([`ran:${k}`, r.program.warm ?? '']); } });
  X.utils.book_append_sheet(wb, sheet(X, [PROG_HEAD, ...prow], [10, 5, 12, 26, 10, 7, 12, 11, 10, 9, 24, 14, 30, 11, 11, 10, 16, 24]), 'Programs');
  X.utils.book_append_sheet(wb, sheet(X, info, [12, 40]), 'Program info');
  X.utils.book_append_sheet(wb, sheet(X, [['Id', 'Name', 'From', 'Saved at', 'Auto-saved', 'Created', 'Archived'], ...library.map(it => [it.id, it.name, it.from ?? '', it.at ?? '', it.auto ? 'Yes' : '', it.created ? 'Yes' : '', it.archived ? 'Yes' : ''])], [14, 36, 7, 26, 11, 9, 9]), 'Saved versions');
  X.utils.book_append_sheet(wb, sheet(X, [['Id', 'Exercise id', 'Exercise', 'Phase', 'Note'], ...(experiments || []).map(e => [e.id, e.ex, exInfo(cfg, e.ex).n, e.ph ?? '', shownNote(cfg, e.ex, e.note)])], [14, 16, 30, 11, 40]), 'Experiments');
  X.utils.book_append_sheet(wb, sheet(X, [CHECK_HEAD, ...checkRows(weeks)], [12, 9, 24, 12]), 'Check-offs');
  X.utils.book_append_sheet(wb, sheet(X, [['Setting', 'Value (JSON)'], ...Object.keys(cfg).sort().map(k => [k, JSON.stringify((cfg as any)[k])])], [18, 60]), 'Config');
}

export function buildWeekWorkbook(X: XLSX, S: Snapshot, key: string, w: Week) {
  const { cfg, programs } = S; const wb = X.utils.book_new();
  const r = weekSummary(cfg, programs, key, w);
  const slots = weekSlots(weekProgram(cfg, programs, w, key), w, key);
  const n = sessionRows(S, e => entryWeek(e) === key);
  X.utils.book_append_sheet(wb, sheet(X, [
    ['Week of', key], ['Program', r.pk], ['Days complete', `${r.full} of ${DAY_COUNT}`], ['Exercises done', `${r.ex} of ${r.total}`], ['Skipped', r.skipped], ['Sessions logged', n.length - 1],
  ], [18, 14]), 'Summary');
  const plan: Row[] = [['Planned day', 'Done on day', 'Section', 'Tier', 'Type', 'Exercise', 'Phase', 'Sets × reps', 'Program weight (lb)', 'Done']];
  const nw = normWeek(w);
  slots.forEach(s => s.items.forEach((it, idx) => {
    const ph = (w.ph && w.ph[`${s.id}:${idx}`]) ?? defaultPhase(cfg, s, idx);
    const moved = w.moved && w.moved[s.id];
    plan.push([colOf(nw, s.day), colOf(nw, moved || s.day), s.sec || '', s.tier || '', s.type === 'single' ? '' : s.type, exInfo(cfg, it.ex).n, phaseLabel(ph), rxOf(cfg, it, ph), it.w ?? (it.bw ? 'BW' : ''), isSkipped(s, nw) || isItemSkipped(s, idx, nw) ? 'Skipped' : isItemDone(s, idx, nw) ? 'Yes' : 'No']);
  }));
  X.utils.book_append_sheet(wb, sheet(X, plan, [11, 11, 11, 10, 9, 34, 13, 16, 18, 6]), 'Plan');
  X.utils.book_append_sheet(wb, sheet(X, n, SESSION_COLS), 'Logged');
  return wb;
}


/* ---------- Full data file (JSON) ---------- */
export const DATA_FORMAT = 1;
export function utf8b64(s: string) { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000) as unknown as number[]); return btoa(bin); }
export function buildDataFile(S: Snapshot, weeks: Record<string, Week>) {
  const { cfg, logs, programs, library, body } = S; const W: Record<string, Week> = {};
  Object.keys(weeks).filter(k => WEEK_RE.test(k)).sort().forEach(k => { const w = normWeek(weeks[k]); if (w.prog || w.rest || w.order || w.extra || w.split || [w.done, w.skipped, w.moved, w.ph, w.warm].some(o => Object.keys(o).length)) W[k] = w; });
  const P: Record<string, Omit<Program, 'key'>> = {}; (['A', 'B'] as const).forEach(k => { if (programs[k] !== BUILTIN[k]) P[k] = progBody(programs[k]); });
  const L: Logs = {}; Object.keys(logs).sort().forEach(id => { if (logs[id] && logs[id].length) L[id] = logs[id]; });
  return { app: 'iron-log', format: DATA_FORMAT, exportedAt: new Date().toISOString(), config: structuredClone(cfg), programs: P, library: structuredClone(library), logs: L, weeks: W, body: bwSorted(body), experiments: normExperiments(S.experiments), ...wellnessOut(S), ...groceryOut(S), ...recipesOut(S), ...dietOut(S) };
}
// Stretches (library, experiments, weekly check-offs) and supplements (water). Left out when the snapshot has none, so older files read the same.
function wellnessOut(S: Snapshot) {
  if (!S.stretches) return {};
  const SW: Record<string, ReturnType<typeof normStretchWeek>> = {}; Object.keys(S.stretchWeeks || {}).filter(k => WEEK_RE.test(k)).sort().forEach(k => { const w = normStretchWeek(S.stretchWeeks![k]); if (!stretchWeekEmpty(w)) SW[k] = w; });
  return { stretches: { items: structuredClone(S.stretches), experiments: structuredClone(S.stretchExps || []) }, stretchWeeks: SW, supplements: normSupplements(S.supp) };
}
// The grocery list, left out when there is none, so files without one read the same.
// Your recipes, left out when there are none (ADR 084).
function recipesOut(S: Snapshot) {
  const r = normRecipes(S.recipes);
  return r.length ? { recipes: r } : {};
}
// Your food log, left out when there is none (ADR 086).
function dietOut(S: Snapshot) {
  const e = normDietEntries(S.diet);
  return e.length ? { diet: e } : {};
}
function groceryOut(S: Snapshot) {
  const g = S.grocery && normGroceryData(S.grocery);
  return g ? { grocery: g } : {};
}
export function parseDataFile(text: string): DataFile {
  let d: any; try { d = JSON.parse(text); } catch { throw new Error('That file isn’t valid JSON.'); }
  if (!d || d.app !== 'iron-log') throw new Error('That isn’t a Loadbearer data file.');
  if (!(d.format >= 1)) throw new Error('Unknown file format.');
  if (d.format > DATA_FORMAT) throw new Error('This file is from a newer version of Loadbearer. Update the app first.');
  return normalizeData(d);
}
// Checks and cleans a data-file-shaped object. Used for both the JSON file and a full Excel workbook.
export function normalizeData(d: any): DataFile {
  const out: DataFile = { exportedAt: d.exportedAt, config: normConfig(d.config), programs: {}, library: [], logs: {}, weeks: {}, body: [], experiments: normExperiments(d.experiments), stretches: d.stretches ? normStretches(d.stretches) : null, stretchWeeks: {}, supplements: d.supplements ? normSupplements(d.supplements) : null, grocery: d.grocery ? normGroceryData(d.grocery) : null };
  Object.entries(d.stretchWeeks || {}).forEach(([k, w]) => { if (WEEK_RE.test(k)) { const n = normStretchWeek(w); if (!stretchWeekEmpty(n)) out.stretchWeeks[k] = n; } });
  const recipes = normRecipes(d.recipes);
  if (recipes.length) out.recipes = recipes;
  const diet = normDietEntries(d.diet);
  if (diet.length) out.diet = diet;
  out.body = normBody(d.body);
  (['A', 'B'] as const).forEach(k => { const p = normProgram(d.programs && d.programs[k], k); if (p) out.programs[k] = progBody(withAllDays({ ...p, key: k })); });
  normLibrary(d.library).forEach(it => out.library.push({ ...it, prog: withAllDays(it.prog) }));
  Object.entries(d.logs || {}).forEach(([id, l]) => { if (id !== '__proto__' && /^[\w.~:@+-]{1,200}$/.test(id) && Array.isArray(l)) { const ok = normEntries(l); if (ok.length) out.logs[id] = ok; } });
  Object.entries(d.weeks || {}).forEach(([k, w]) => { if (WEEK_RE.test(k) && w && typeof w === 'object') out.weeks[k] = normWeek(w); });
  return out;
}
export const todayStamp = () => ymd(new Date());
