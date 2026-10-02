/* ---------- CSV / Excel export, full data file, GitHub backup helpers ----------
   Every builder takes a state snapshot S = {cfg, logs, programs, library, body}. */
import { PHASES, PH_KEYS, BUILTIN, slotsFor, exInfo, hasValidDays, withAllDays } from './data.js';
import { ymd, fmtShort } from './dates.js';
import { setsOfEntry, setVal, rxOf, isItemDone, normWeek, progName, AUTO_NOTE } from './logic.js';

const noteOf = e => e.n || (e.auto ? AUTO_NOTE : '');
import { MUSCLES, tagsOf, muscleNames } from './muscles.js';
import { WEEK_RE, weekOfDate, entryWeek, weekSummary } from './trends.js';
import { bwSorted } from './body.js';

// SheetJS is bundled (0.20.x, patched for reading untrusted files) and loaded only when needed.
export const loadXLSX = () => import('xlsx').catch(() => { throw new Error('Excel library failed to load'); });

export const phaseLabel = p => (p ? PHASES[p].label : '');
const entryVolume = e => { if (e.sec) return ''; const v = setsOfEntry(e).reduce((a, x) => a + (Number(x.w) > 0 && Number(x.r) > 0 ? Number(x.w) * Number(x.r) : 0), 0); return v || ''; };
const setDetail = e => (Array.isArray(e.sets) && e.sets.length ? e.sets.map(x => `${x.w != null ? x.w : 'BW'}×${setVal(x)}`).join(', ') : '');

function csvCell(v) { const t = v == null ? '' : String(v); return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }
export function buildCsv(S) {
  const { cfg, logs } = S;
  const head = ['date', 'exercise', 'phase', 'weight_lb', 'sets', 'reps', 'hold_s', 'set_detail', 'primary_muscles', 'secondary_muscles', 'note', 'program_slot', 'week_of'];
  const rows = [];
  Object.keys(logs).forEach(id => (logs[id] || []).forEach(e => rows.push([e.d, exInfo(cfg, id).n, e.ph ? PHASES[e.ph].label : '', e.w ?? '', e.s ?? '', e.r ?? '', e.sec ?? '', setDetail(e), muscleNames(cfg, id, 'p'), muscleNames(cfg, id, 's'), noteOf(e), e.slot || '', e.wk || ''])));
  rows.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  return [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
}

function sheet(X, rows, widths) {
  const ws = X.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map(w => ({ wch: w }));
  if (rows.length > 1) ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }) };
  return ws;
}
function sessionRows(S, filter) {
  const { cfg, logs } = S; const rows = [];
  Object.keys(logs).forEach(id => (logs[id] || []).forEach(e => { if (!filter || filter(e)) rows.push([e.d, e.wk || weekOfDate(e.d), exInfo(cfg, id).n, phaseLabel(e.ph), e.w ?? '', e.s ?? '', e.sec ? '' : (e.r ?? ''), e.sec ?? '', setDetail(e), entryVolume(e), muscleNames(cfg, id, 'p'), muscleNames(cfg, id, 's'), noteOf(e), e.slot || '', id]); }));
  rows.sort((a, b) => (a[0] === b[0] ? a[2].localeCompare(b[2]) : a[0].localeCompare(b[0])));
  return [['Date', 'Week of', 'Exercise', 'Phase', 'Weight (lb)', 'Sets', 'Reps', 'Hold (s)', 'Set by set', 'Volume (lb)', 'Primary muscles', 'Secondary muscles', 'Note', 'Program slot', 'Exercise id'], ...rows];
}
const SESSION_COLS = [11, 11, 34, 13, 11, 6, 6, 9, 26, 12, 28, 28, 30, 14, 16];

export function buildOverallWorkbook(X, S, weeks) {
  const { cfg, logs, programs, body } = S; const wb = X.utils.book_new();
  const sum = [['Exercise', 'Latest phase', 'Sessions', 'First logged', 'Last logged', 'First weight (lb)', 'Latest weight (lb)', 'Best weight (lb)', 'Change (lb)', '1RM (lb)']];
  Object.keys(logs).filter(id => logs[id].length).sort((a, b) => exInfo(cfg, a).n.localeCompare(exInfo(cfg, b).n)).forEach(id => {
    const L = logs[id], last = L[L.length - 1];
    const ws = L.filter(e => (e.ph || null) === (last.ph || null) && Number(e.w) > 0).map(e => Number(e.w));
    const first = ws.length ? ws[0] : '', latest = ws.length ? ws[ws.length - 1] : '';
    sum.push([exInfo(cfg, id).n, phaseLabel(last.ph), L.length, L[0].d, last.d, first, latest, ws.length ? Math.max(...ws) : '', ws.length ? latest - first : '', cfg.rm[id] ?? '']);
  });
  X.utils.book_append_sheet(wb, sheet(X, sum, [34, 13, 9, 12, 12, 15, 16, 15, 11, 9]), 'Summary');
  X.utils.book_append_sheet(wb, sheet(X, sessionRows(S), SESSION_COLS), 'Sessions');
  // Logged sets per muscle per week (secondary work counts half)
  const mv = {};
  Object.keys(logs).forEach(id => {
    const t = tagsOf(cfg, id); if (!t || t.mob) return;
    (logs[id] || []).forEach(e => {
      const k = entryWeek(e); const sets = Number(e.s) || 0; if (!sets) return;
      ['p', 's'].forEach(role => (t[role] || []).forEach(m => { const key = k + '|' + m; const r = mv[key] = mv[key] || { k, m, p: 0, s: 0 }; r[role] += sets; }));
    });
  });
  const mus = [['Week of', 'Muscle', 'Primary sets', 'Secondary sets', 'Weighted sets']];
  Object.values(mv).sort((a, b) => (a.k === b.k ? (b.p + b.s / 2) - (a.p + a.s / 2) : a.k.localeCompare(b.k))).forEach(r => mus.push([r.k, MUSCLES[r.m] ? MUSCLES[r.m].n : r.m, r.p, r.s, r.p + r.s / 2]));
  X.utils.book_append_sheet(wb, sheet(X, mus, [12, 24, 13, 15, 14]), 'Muscles');
  const wk = [['Week of', 'Program', 'Days complete', 'Exercises done', 'Exercises planned', 'Skipped', '% done', 'Sessions logged']];
  Object.keys(weeks).filter(k => WEEK_RE.test(k)).sort().forEach(k => {
    const r = weekSummary(cfg, programs, k, weeks[k]); const n = Object.values(logs).reduce((a, L) => a + L.filter(e => entryWeek(e) === k).length, 0);
    if (r.ex || n || r.skipped) wk.push([k, r.pk, r.full, r.ex, r.total, r.skipped, r.total ? Math.round(r.ex / r.total * 100) : 0, n]);
  });
  X.utils.book_append_sheet(wb, sheet(X, wk, [12, 9, 14, 15, 17, 9, 8, 15]), 'Weeks');
  const bwl = bwSorted(body); const bws = [['Week of', 'Date', 'Body weight (lb)', 'Change (lb)']];
  bwl.forEach((e, i) => bws.push([e.wk, e.d, e.w, i ? Math.round((e.w - bwl[i - 1].w) * 10) / 10 : '']));
  X.utils.book_append_sheet(wb, sheet(X, bws, [12, 12, 17, 12]), 'Body weight');
  const st = [['Setting', 'Value'], ['Mode', cfg.mode], ['Rest between sets (s)', cfg.rest ?? 90], ['Program A name', progName(cfg, 'A')], ['Program B name', progName(cfg, 'B')]];
  PH_KEYS.forEach(p => st.push([`${PHASES[p].label} % of 1RM`, cfg.pct[p] ?? PHASES[p].pct]));
  Object.keys(cfg.rm).sort().forEach(id => st.push([`1RM: ${exInfo(cfg, id).n}`, cfg.rm[id]]));
  st.push(['Exported', new Date().toISOString()]);
  X.utils.book_append_sheet(wb, sheet(X, st, [34, 24]), 'Settings');
  addDataSheets(X, wb, S, weeks);
  return wb;
}

/* ---------- Data sheets: what the workbook holds beyond the readable report, so it imports back whole ---------- */
export const PROG_HEAD = ['Program', 'Day', 'Day title', 'Day subtitle', 'Make-up day', 'Slot #', 'Slot id', 'Section', 'Tier', 'Type', 'Slot note', 'Exercise id', 'Exercise', 'Phase', 'Weight (lb)', 'Bodyweight', 'Rx', 'Item note'];
const dayCells = d => [d.title ?? '', d.sub ?? '', d.makeup ? 'Yes' : ''];
export function programRows(cfg, owner, prog) {
  const rows = [];
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
export function checkRows(weeks) {
  const rows = [];
  Object.keys(weeks).filter(k => WEEK_RE.test(k)).sort().forEach(k => {
    const w = normWeek(weeks[k]);
    if (w.prog) rows.push([k, 'prog', '', w.prog]);
    ['done', 'skipped'].forEach(kind => Object.keys(w[kind]).forEach(id => { if (w[kind][id]) rows.push([k, kind, id, 'Yes']); }));
    Object.entries(w.moved).forEach(([id, day]) => rows.push([k, 'moved', id, day]));
    Object.entries(w.ph).forEach(([id, ph]) => rows.push([k, 'phase', id, ph]));
    Object.entries(w.warm).forEach(([day, o]) => Object.entries(o).forEach(([item, v]) => rows.push([k, 'warm', `${day}/${item}`, v ? 'Yes' : 'No'])));
  });
  return rows;
}
function addDataSheets(X, wb, S, weeks) {
  const { cfg, programs, library } = S;
  const prow = [], info = [['Program', 'Warm-up']];
  ['A', 'B'].forEach(k => { if (programs[k] !== BUILTIN[k]) { prow.push(...programRows(cfg, k, programs[k])); info.push([k, programs[k].warm ?? '']); } });
  library.forEach(it => { prow.push(...programRows(cfg, it.id, it.prog)); info.push([it.id, it.prog.warm ?? '']); });
  X.utils.book_append_sheet(wb, sheet(X, [PROG_HEAD, ...prow], [10, 5, 12, 26, 10, 7, 12, 11, 10, 9, 24, 14, 30, 11, 11, 10, 16, 24]), 'Programs');
  X.utils.book_append_sheet(wb, sheet(X, info, [12, 40]), 'Program info');
  X.utils.book_append_sheet(wb, sheet(X, [['Id', 'Name', 'From', 'Saved at', 'Auto-saved', 'Created'], ...library.map(it => [it.id, it.name, it.from ?? '', it.at ?? '', it.auto ? 'Yes' : '', it.created ? 'Yes' : ''])], [14, 36, 7, 26, 11, 9]), 'Saved versions');
  X.utils.book_append_sheet(wb, sheet(X, [CHECK_HEAD, ...checkRows(weeks)], [12, 9, 24, 12]), 'Check-offs');
  X.utils.book_append_sheet(wb, sheet(X, [['Setting', 'Value (JSON)'], ...Object.keys(cfg).sort().map(k => [k, JSON.stringify(cfg[k])])], [18, 60]), 'Config');
}

export function buildWeekWorkbook(X, S, key, w) {
  const { cfg, programs } = S; const wb = X.utils.book_new();
  const r = weekSummary(cfg, programs, key, w);
  const slots = slotsFor(programs[r.pk] || programs.A);
  const n = sessionRows(S, e => entryWeek(e) === key);
  X.utils.book_append_sheet(wb, sheet(X, [
    ['Week of', key], ['Program', r.pk], ['Days complete', `${r.full} of 6`], ['Exercises done', `${r.ex} of ${r.total}`], ['Skipped', r.skipped], ['Sessions logged', n.length - 1],
  ], [18, 14]), 'Summary');
  const plan = [['Planned day', 'Done on day', 'Section', 'Tier', 'Type', 'Exercise', 'Phase', 'Sets × reps', 'Program weight (lb)', 'Done']];
  const nw = normWeek(w);
  slots.forEach(s => s.items.forEach((it, idx) => {
    const ph = (w.ph && w.ph[`${s.id}:${idx}`]) ?? cfg.phDef[`${s.id}:${idx}`] ?? it.ph ?? null;
    const moved = w.moved && w.moved[s.id];
    plan.push([s.day, moved || s.day, s.sec || '', s.tier || '', s.type === 'single' ? '' : s.type, exInfo(cfg, it.ex).n, phaseLabel(ph), rxOf(cfg, it, ph), it.w ?? (it.bw ? 'BW' : ''), (w.skipped && w.skipped[s.id]) ? 'Skipped' : isItemDone(s, idx, nw) ? 'Yes' : 'No']);
  }));
  X.utils.book_append_sheet(wb, sheet(X, plan, [11, 11, 11, 10, 9, 34, 13, 16, 18, 6]), 'Plan');
  X.utils.book_append_sheet(wb, sheet(X, n, SESSION_COLS), 'Logged');
  return wb;
}

/* ---------- Programs in the library ---------- */
export const progBody = p => { const b = structuredClone(p); delete b.key; return b; };
export const sameProg = (a, b) => JSON.stringify(progBody(a)) === JSON.stringify(progBody(b));
export const libDate = iso => { const d = new Date(iso); return isNaN(d) ? '' : `${fmtShort(d)}, ${d.getFullYear()}`; };

/* ---------- Full data file (JSON) ---------- */
export const DATA_FORMAT = 1;
export function utf8b64(s) { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(bin); }
export function buildDataFile(S, weeks) {
  const { cfg, logs, programs, library, body } = S; const W = {};
  Object.keys(weeks).filter(k => WEEK_RE.test(k)).sort().forEach(k => { const w = normWeek(weeks[k]); if (w.prog || [w.done, w.skipped, w.moved, w.ph, w.warm].some(o => Object.keys(o).length)) W[k] = w; });
  const P = {}; ['A', 'B'].forEach(k => { if (programs[k] !== BUILTIN[k]) P[k] = progBody(programs[k]); });
  const L = {}; Object.keys(logs).sort().forEach(id => { if (logs[id] && logs[id].length) L[id] = logs[id]; });
  return { app: 'iron-log', format: DATA_FORMAT, exportedAt: new Date().toISOString(), config: structuredClone(cfg), programs: P, library: structuredClone(library), logs: L, weeks: W, body: bwSorted(body) };
}
export function dataStats(d) {
  const L = Object.values(d.logs || {}); const sets = L.reduce((a, l) => a + l.length, 0);
  return { entries: sets, exercises: L.filter(l => l.length).length, weeks: Object.keys(d.weeks || {}).length, programs: Object.keys(d.programs || {}), saved: (d.library || []).length, body: (d.body || []).length };
}
export function parseDataFile(text) {
  let d; try { d = JSON.parse(text); } catch { throw new Error('That file isn’t valid JSON.'); }
  if (!d || d.app !== 'iron-log') throw new Error('That isn’t an Iron Log data file.');
  if (!(d.format >= 1)) throw new Error('Unknown file format.');
  if (d.format > DATA_FORMAT) throw new Error('This file is from a newer version of Iron Log. Update the app first.');
  return normalizeData(d);
}
// Checks and cleans a data-file-shaped object. Used for both the JSON file and a full Excel workbook.
export function normalizeData(d) {
  const out = { exportedAt: d.exportedAt, config: (d.config && typeof d.config === 'object') ? d.config : {}, programs: {}, library: [], logs: {}, weeks: {}, body: [] };
  (Array.isArray(d.body) ? d.body : []).forEach(e => { if (e && WEEK_RE.test(e.wk) && typeof e.d === 'string' && Number(e.w) > 0 && !out.body.some(x => x.wk === e.wk)) out.body.push({ wk: e.wk, d: e.d, w: Number(e.w) }); });
  ['A', 'B'].forEach(k => { const p = d.programs && d.programs[k]; if (hasValidDays(p)) out.programs[k] = withAllDays(p); });
  (Array.isArray(d.library) ? d.library : []).forEach(it => { if (it && it.id && hasValidDays(it.prog)) out.library.push({ ...it, prog: withAllDays(it.prog) }); });
  Object.entries(d.logs || {}).forEach(([id, l]) => { if (/^[\w.~:@+-]{1,200}$/.test(id) && Array.isArray(l)) { const ok = l.filter(e => e && typeof e.d === 'string'); if (ok.length) out.logs[id] = ok; } });
  Object.entries(d.weeks || {}).forEach(([k, w]) => { if (WEEK_RE.test(k) && w && typeof w === 'object') out.weeks[k] = normWeek(w); });
  return out;
}
// A stored `wk` that is just the week of the entry's date carries no information, so it doesn't make two entries different.
const sameKey = e => JSON.stringify(e.wk === weekOfDate(e.d) ? { ...e, wk: undefined } : e);
export function mergeEntries(a, b) { const seen = new Set(a.map(sameKey)); const out = [...a]; b.forEach(e => { const k = sameKey(e); if (!seen.has(k)) { seen.add(k); out.push(e); } }); return out.sort((x, y) => x.d.localeCompare(y.d)); }
export function mergeWeek(a, b) {
  const w = normWeek(a); const o = normWeek(b);
  w.prog = w.prog || o.prog;
  ['moved', 'ph'].forEach(k => { w[k] = { ...o[k], ...w[k] }; });
  Object.keys(o.warm).forEach(d => { w.warm[d] = { ...o.warm[d], ...(w.warm[d] || {}) }; });
  w.done = { ...o.done, ...w.done }; w.skipped = { ...o.skipped, ...w.skipped }; Object.keys(w.done).forEach(id => delete w.skipped[id]);
  return w;
}

/* ---------- GitHub backup (Claude-hosted version, via the viewer's Composio connector) ---------- */
export const GH_SERVER = 'Composio For You';
export const GH_TOOL = 'COMPOSIO_MULTI_EXECUTE_TOOL';
export const backupCfg = cfg => ({ repo: 'jacgit18/iron-log-data', branch: 'main', hashes: {}, ...(cfg.backup || {}) });
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
export function weekFingerprint(S, key, w) {
  const { cfg, logs, programs } = S;
  const L = Object.keys(logs).sort().map(id => [id, (logs[id] || []).filter(e => entryWeek(e) === key)]);
  return hashStr(JSON.stringify([w.done, w.skipped, w.moved, w.ph, w.prog, L, programs[weekSummary(cfg, programs, key, w).pk]]));
}
export function backupError(e) {
  const c = e && e.code;
  if (c === 'server_not_connected' || c === 'selection_required') return 'Add or pick the Composio connector in claude.ai Settings → Connectors, then try again.';
  if (c === 'needs_reauth') return 'Reconnect Composio in claude.ai Settings → Connectors, then try again.';
  if (c === 'not_in_manifest') return 'GitHub access isn’t allowed for this page. Allow the connector when asked, or turn it back on in the page’s connector settings.';
  if (c === 'blocked_by_policy' || c === 'approval_required') return 'Your organization’s settings block this connector here.';
  if (c === 'server_unavailable' || c === 'upstream_error' || c === 'cancelled') return 'GitHub didn’t answer in time. The backup may still have gone through, so check the repo before trying again.';
  if (c === 'not_granted' || c === 'capability_disabled' || c === 'capability_removed') return 'GitHub backup isn’t available in this view.';
  return (e && e.message) ? e.message : 'Backup failed.';
}
export const daysSince = last => (last ? Math.floor((Date.now() - new Date(last.at).getTime()) / 864e5) : null);
export const daysSinceBackup = cfg => daysSince(cfg.backup && cfg.backup.last);

/* ---------- GitHub backup (standalone app: GitHub REST API with the viewer's token) ---------- */
export const ghCfg = cfg => ({ repo: 'jacgit18/iron-log', branch: 'data', ...(cfg.ghBackup || {}) });
// Same value for the same data, whenever it was exported and whatever the backup bookkeeping says.
export function dataFingerprint(d) {
  const config = { ...d.config }; delete config.backup; delete config.ghBackup;
  return hashStr(JSON.stringify({ ...d, exportedAt: null, config }));
}
export const todayStamp = () => ymd(new Date());
