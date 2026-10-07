/* ---------- Recover data from an Iron Log Excel export (iron-log-YYYY-MM-DD.xlsx) ----------
   The workbook is a report, not a backup: it has every logged session, body weight and the main
   settings, but not weekly check-offs, edited programs, saved versions or phase defaults. This turns
   what it does have into the same shape as a parsed JSON data file, so the normal merge can add it. */
import { EX, PHASES, PH_KEYS } from './data.js';
import { parseDate } from '../shared/dates.js';
import { weekSlots, activeProgKey, normWeek, setItemDone, AUTO_NOTE } from './logic.js';
import { MUSCLES, MUSCLE_MAP } from './muscles.js';
import { WEEK_RE, entryWeek } from './trends.js';
import { loadXLSX, normalizeData } from './export.js';
import type { BodyEntry, Cfg, DataFile, LogEntry, LogSet, Logs, MuscleKey, MuscleTags, Program, Week } from '../types.ts';
import { validMode, validRest, validPct, validRm, validBodyLb, normEntries } from '../shared/validate.js';

type XLSX = typeof import('xlsx');
// Workbook cells are whatever the file held: text, numbers, blanks.
type Cell = any; // eslint-disable-line
type Rows = Cell[][];
/** What an Excel or CSV import hands the merge: a data file's parts (a plain report has no stretches, supplements or programs), plus what was read from the report itself. */
export type ExcelImport = Pick<DataFile, 'config' | 'programs' | 'library' | 'logs' | 'weeks' | 'body'> & Partial<Pick<DataFile, 'exportedAt' | 'experiments' | 'stretches' | 'stretchWeeks' | 'supplements'>> & {
  excel: { settings: { mode?: number; rest?: number; pct?: Record<string, number> }; skipped: number; newExercises: string[]; complete?: boolean; csv?: boolean };
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Keys that would reach Object.prototype if used as a property name on a plain object.
const UNSAFE_KEY = new Set(['__proto__', 'constructor', 'prototype']);
const num = (v: unknown): number | null => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const phaseKey = (label: unknown) => PH_KEYS.find(k => PHASES[k].label === label) || null;
const muscleKey = (name: string) => (Object.keys(MUSCLES) as MuscleKey[]).find(k => MUSCLES[k].n === name);
// Dates are exported as "YYYY-MM-DD" text, but Excel and Google Sheets turn them into real dates
// when the file is opened and saved again; those come back as serial numbers.
const pad = (n: number) => String(n).padStart(2, '0');
const dateText = (X: XLSX, v: Cell): string => {
  if (typeof v !== 'number') return String(v);
  const p = X.SSF.parse_date_code(v);
  return p ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : String(v);
};

// "41×15, 42×15" / "BW×30s" / "BW×?"  →  [{w, r}] or [{w, sec}]
function parseSetDetail(s: unknown): LogSet[] | null {
  if (!s || typeof s !== 'string') return null;
  const out: LogSet[] = [];
  for (const part of s.split(', ')) {
    const m = part.match(/^(BW|[\d.]+)×(\?|[\d.]+s?)$/); if (!m) return null;
    const w = m[1] === 'BW' ? null : Number(m[1]);
    if (m[2].endsWith('s')) out.push({ w, sec: Number(m[2].slice(0, -1)) });
    else out.push({ w, r: m[2] === '?' ? null : Number(m[2]) });
  }
  return out.length ? out : null;
}

function slugFor(name: string, taken: Record<string, { n?: string }>) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'exercise';
  let id = base, n = 2;
  while (EX[id] || (taken[id] && taken[id].n !== name)) id = `${base}-${n++}`;
  return id;
}

// Same fields as the app writes, so an entry that's already here isn't added twice.
export const entryKey = (e: LogEntry) => JSON.stringify([e.d, e.ph || null, e.w ?? null, e.s ?? null, e.r ?? null, e.sec ?? null, e.sets || null, e.n || null]);

// Sessions rows (the Sessions sheet's columns, header first) → logs, new custom exercises and muscle tags.
function readSessions(X: XLSX, sessions: Rows, cfg: Cfg) {
  // Exercise names → ids: built-in names, then your custom exercises, then new custom ones.
  const known: Record<string, { n?: string }> = { ...(cfg.ex || {}) }; const byName: Record<string, string> = Object.create(null);
  Object.entries(EX).forEach(([id, e]) => { byName[e.n] = id; });
  Object.entries(known).forEach(([id, e]) => { if (e && e.n && !byName[e.n]) byName[e.n] = id; });
  const newEx: Record<string, { n: string }> = {};
  const idFor = (name: string): string => {
    if (byName[name]) return byName[name];
    if (EX[name] || known[name]) return name; // exported with a missing name, the id was used instead
    const id = slugFor(name, { ...known, ...newEx }); newEx[id] = { n: name }; byName[name] = id; return id;
  };

  const logs: Record<string, any[]> = {}; const tags: Record<string, { prim: string; sec: string }> = {}; let skipped = 0;
  for (const r of sessions.slice(1)) {
    const [d0, wk0, name, phase, w, s, reps, hold, detail, , prim, sec, note, slot, exId] = r.map(v => (typeof v === 'string' ? v.trim() : v));
    const d = dateText(X, d0), wk = dateText(X, wk0);
    if (!DATE_RE.test(String(d)) || !name) { skipped++; continue; }
    const id = exId ? String(exId) : idFor(String(name));
    const e: LogEntry = { d: String(d), ph: phaseKey(phase), w: num(w), s: num(s) };
    if (num(hold) != null) e.sec = num(hold); else e.r = num(reps);
    const sets = parseSetDetail(detail); if (sets) e.sets = sets;
    if (note === AUTO_NOTE) e.auto = true; else if (note) e.n = String(note);
    if (slot) e.slot = String(slot);
    if (WEEK_RE.test(String(wk))) e.wk = String(wk);
    if (UNSAFE_KEY.has(id)) { skipped++; continue; }
    (logs[id] = logs[id] || []).push(e);
    if (!tags[id]) tags[id] = { prim: String(prim || ''), sec: String(sec || '') };
  }
  // Same cleaning as a JSON file: a session on a date that doesn't exist (2026-02-31) or with numbers out of range is fixed or skipped.
  Object.keys(logs).forEach(id => { const L = normEntries(logs[id]); skipped += logs[id].length - L.length; if (L.length) logs[id] = L.sort((a, b) => a.d.localeCompare(b.d)); else delete logs[id]; });

  // Muscle tags, only where they differ from the built-in ones (e.g. new exercises or ones you re-tagged).
  const muscleMap: Record<string, MuscleTags> = {};
  Object.entries(tags).forEach(([id, t]) => {
    const tg: MuscleTags = t.prim === 'Mobility' ? { mob: true } : { p: t.prim.split(', ').map(muscleKey).filter((m): m is MuscleKey => !!m), s: t.sec.split(', ').map(muscleKey).filter((m): m is MuscleKey => !!m) };
    if (!tg.mob && !tg.p!.length && !tg.s!.length) return;
    const def = MUSCLE_MAP[id];
    const same = def && JSON.stringify({ mob: !!def.mob, p: def.p || [], s: def.s || [] }) === JSON.stringify({ mob: !!tg.mob, p: tg.p || [], s: tg.s || [] });
    if (!same) muscleMap[id] = tg;
  });
  return { logs, newEx, muscleMap, skipped, idFor };
}

export async function parseExcelExport(buffer: ArrayBuffer, cfg: Cfg): Promise<ExcelImport> {
  const X = await loadXLSX();
  let wb: ReturnType<XLSX['read']>;
  try { wb = X.read(buffer, { type: 'array' }); } catch { throw new Error('That file couldn’t be read as an Excel workbook.'); }
  const rows = (name: string): Rows | null => (wb.Sheets[name] ? X.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true }) : null);
  const sessions = rows('Sessions');
  if (!sessions || String(sessions[0]?.[2]) !== 'Exercise' || String(sessions[0]?.[0]) !== 'Date') {
    if (rows('Plan')) throw new Error('That’s a single-week Excel file. Import the main iron-log workbook, or better, the iron-log-data .json file.');
    throw new Error('That isn’t an Iron Log Excel export.');
  }

  const { logs, newEx, muscleMap, skipped, idFor } = readSessions(X, sessions, cfg);

  const body: BodyEntry[] = [];
  (rows('Body weight') || []).slice(1).forEach(([wk0, d0, w]) => {
    const wk = dateText(X, wk0), d = dateText(X, d0);
    if (WEEK_RE.test(String(wk)) && DATE_RE.test(String(d)) && validBodyLb(num(w)) && !body.some(x => x.wk === wk)) body.push({ wk: String(wk), d: String(d), w: num(w) as number });
  });

  const config: any = { rm: {}, ex: newEx, muscleMap, progNames: {} }; // cleaned later by normalizeData / the merge
  const settings: any = {}; let exportedAt: string | undefined;
  (rows('Settings') || []).slice(1).forEach(([k, v]) => {
    k = String(k);
    if (k === 'Mode' && validMode(num(v))) settings.mode = num(v);
    else if (k === 'Rest between sets (s)' && validRest(num(v))) settings.rest = num(v);
    else if (/^Program [AB] name$/.test(k) && v && v !== `Program ${k[8]}`) config.progNames[k[8]] = String(v).slice(0, 40);
    else if (k.startsWith('1RM: ') && validRm(num(v))) config.rm[idFor(k.slice(5))] = num(v);
    else if (k === 'Exported') exportedAt = String(v);
    else { const p = PH_KEYS.find(key => k === `${PHASES[key].label} % of 1RM`); if (p && validPct(num(v))) (settings.pct = settings.pct || {})[p] = num(v); }
  });

  const excel = { settings, skipped, newExercises: Object.values(newEx).map(e => e.n) };
  const full = readDataSheets(X, rows);
  if (full) {
    // A whole-backup workbook: every table is there, so it imports exactly like the JSON data file.
    const data = normalizeData({ ...full, exportedAt, logs, body });
    return { ...data, excel: { ...excel, complete: true } };
  }
  return { exportedAt, config, programs: {}, library: [], logs, weeks: {}, body, experiments: [], excel };
}

const str = (v: Cell) => (v == null ? '' : String(v));
const put = (o: Record<string, unknown>, k: string, v: unknown) => { if (v !== '' && v != null) o[k] = v; };
function readProgram(rows: Rows, warm?: string): any {
  const days: any[] = [];
  rows.forEach(r => {
    const [, day, title, sub, makeup, slotNo, id, sec, tier, type, note, ex, , ph, w, bw, rx, itemNote] = r;
    const di = (num(day) as number) - 1; if (!(di >= 0)) return;
    const d: any = days[di] = days[di] || { title: str(title), slots: [] };
    put(d, 'sub', str(sub)); if (str(makeup) === 'Yes') d.makeup = true;
    if (!num(slotNo)) return;
    const s: any = d.slots[(num(slotNo) as number) - 1] = d.slots[(num(slotNo) as number) - 1] || { items: [] };
    put(s, 'id', str(id)); put(s, 'sec', str(sec)); put(s, 'tier', str(tier)); put(s, 'type', str(type)); put(s, 'note', str(note));
    if (!ex) return;
    const it: any = { ex: str(ex), ph: str(ph) || null, w: num(w) };
    if (str(bw) === 'Yes') it.bw = true; put(it, 'rx', str(rx)); put(it, 'note', str(itemNote));
    s.items.push(it);
  });
  for (let i = 0; i < days.length; i++) { days[i] = days[i] || { title: `Day ${i + 1}`, slots: [] }; days[i].slots = days[i].slots.filter(Boolean); }
  const prog: any = { days };
  if (warm) prog.warm = warm;
  return prog;
}
function readWeeks(X: XLSX, rows: Rows) {
  const weeks: Record<string, Week> = {};
  rows.forEach(([wk0, kind, key, v]) => {
    const wk = dateText(X, wk0); if (!WEEK_RE.test(wk)) return;
    const w: any = weeks[wk] = weeks[wk] || normWeek();
    key = str(key);
    if (kind === 'prog') w.prog = str(v);
    else if (kind === 'rest') w.rest = str(v).split(/[\s,]+/).filter(Boolean).map(Number).filter(n => n >= 1);
    else if (kind === 'restOn') { const t = dateText(X, v); if (WEEK_RE.test(t)) w.restOn = t; }
    else if (kind === 'order') w.order = str(v).split(/[\s,]+/).filter(Boolean).map(Number);
    else if (kind === 'extra') { try { (w.extra = w.extra || []).push(JSON.parse(str(v))); } catch { /* skip an unreadable card */ } }
    else if (kind === 'done' || kind === 'skipped') w[kind][key] = true;
    else if (kind === 'moved') w.moved[key] = num(v);
    else if (kind === 'phase') w.ph[key] = str(v);
    else if (kind === 'warm') { const [day, item] = key.split('/'); if (!UNSAFE_KEY.has(day) && !UNSAFE_KEY.has(item)) (w.warm[day] = w.warm[day] || {})[item] = str(v) === 'Yes'; }
  });
  return weeks;
}
// The data sheets of a whole-backup workbook, as a data-file-shaped object; null for older workbooks without them.
function readDataSheets(X: XLSX, rows: (name: string) => Rows | null) {
  const prog = rows('Programs'), info = rows('Program info'), lib = rows('Saved versions'), checks = rows('Check-offs'), conf = rows('Config'), exps = rows('Experiments');
  if (!prog || !info || !lib || !checks || !conf) return null;
  const warms = Object.fromEntries(info.slice(1).map(([o, w]) => [str(o), str(w)]));
  const owners = Object.create(null); prog.slice(1).forEach(r => { (owners[str(r[0])] = owners[str(r[0])] || []).push(r); });
  const programs: Record<string, Program> = {}; ['A', 'B'].forEach(k => { if (owners[k]) programs[k] = readProgram(owners[k], warms[k]); });
  const library = lib.slice(1).filter(r => r[0] !== '').map(([id, name, from, at, auto, created]) => {
    const it: any = { id: str(id), name: str(name), at: str(at), prog: readProgram(owners[str(id)] || [], warms[str(id)]) };
    put(it, 'from', str(from)); if (str(auto) === 'Yes') it.auto = true; if (str(created) === 'Yes') it.created = true; return it;
  });
  const config: Record<string, unknown> = {};
  conf.slice(1).forEach(([k, v]) => { try { config[str(k)] = JSON.parse(str(v)); } catch { /* skip an unreadable setting */ } });
  const experiments = exps ? exps.slice(1).filter(r => r[0] !== '' && r[0] != null).map(([id, ex, , ph, note]) => ({ id: str(id), ex: str(ex), ph: str(ph) || null, note: str(note) })) : [];
  return { config, programs, library, weeks: readWeeks(X, checks.slice(1)), experiments };
}

// A workbook has no check-offs, but every session names the program slot it was logged from, so each
// one checks its exercise off in the week it was logged. `weeks` are the saved weeks here, which decide
// the program a week ran. Returns {weekKey: week} holding only those check-offs, ready to merge.
export function checkOffsFromLogs(cfg: Cfg, programs: Record<string, Program>, logs: Logs, weeks: Record<string, Partial<Week>>) {
  const out: Record<string, Week> = {};
  Object.entries(logs).forEach(([ex, L]) => L.forEach(e => {
    if (!e.slot) return;
    const k = entryWeek(e); if (!WEEK_RE.test(k)) return;
    const w = out[k] || (out[k] = normWeek({ prog: weeks[k] && weeks[k].prog }));
    const prog = programs[activeProgKey(cfg, w, parseDate(k))] || programs.A;
    const s = weekSlots(prog, weeks[k] || {}).find(x => x.id === e.slot);
    const i = s ? s.items.findIndex(it => it.ex === ex) : -1;
    if (i >= 0) setItemDone(w, s!, i, true);
  }));
  Object.keys(out).forEach(k => { if (!Object.keys(out[k].done).length) delete out[k]; });
  return out;
}

/* ---------- CSV (the iron-log.csv export), as a fallback: sessions only ---------- */
function csvRows(text: string) {
  const rows: string[][] = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = []; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => v !== ''));
}
export async function parseCsvExport(text: string, cfg: Cfg): Promise<ExcelImport> {
  const X = await loadXLSX();
  const r = csvRows(text.replace(/^\uFEFF/, ''));
  const head = (r[0] || []).map(v => v.trim().toLowerCase());
  if (head[0] !== 'date' || head[1] !== 'exercise') throw new Error('That isn’t an Iron Log CSV export.');
  const at = (n: string) => head.indexOf(n);
  const sessions = [[], ...r.slice(1).map(c => {
    const g = (n: string) => (at(n) >= 0 ? c[at(n)] ?? '' : '');
    return [g('date'), g('week_of'), g('exercise'), g('phase'), g('weight_lb'), g('sets'), g('reps'), g('hold_s'), g('set_detail'), '', g('primary_muscles'), g('secondary_muscles'), g('note'), g('program_slot'), ''];
  })];
  const { logs, newEx, muscleMap, skipped } = readSessions(X, sessions, cfg);
  return { exportedAt: undefined, config: { rm: {}, ex: newEx, muscleMap, progNames: {} }, programs: {}, library: [], logs, weeks: {}, body: [], excel: { settings: {}, skipped, newExercises: Object.values(newEx).map(e => e.n), csv: true } };
}
