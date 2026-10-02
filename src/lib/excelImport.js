/* ---------- Recover data from an Iron Log Excel export (iron-log-YYYY-MM-DD.xlsx) ----------
   The workbook is a report, not a backup: it has every logged session, body weight and the main
   settings, but not weekly check-offs, edited programs, saved versions or phase defaults. This turns
   what it does have into the same shape as a parsed JSON data file, so the normal merge can add it. */
import { EX, PHASES, PH_KEYS, slotsFor } from './data.js';
import { parseDate } from './dates.js';
import { activeProgKey, normWeek, setItemDone, AUTO_NOTE } from './logic.js';
import { MUSCLES, MUSCLE_MAP } from './muscles.js';
import { WEEK_RE, entryWeek } from './trends.js';
import { loadXLSX, normalizeData } from './export.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const num = v => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
const phaseKey = label => PH_KEYS.find(k => PHASES[k].label === label) || null;
const muscleKey = name => Object.keys(MUSCLES).find(k => MUSCLES[k].n === name);
// Dates are exported as "YYYY-MM-DD" text, but Excel and Google Sheets turn them into real dates
// when the file is opened and saved again; those come back as serial numbers.
const pad = n => String(n).padStart(2, '0');
const dateText = (X, v) => {
  if (typeof v !== 'number') return String(v);
  const p = X.SSF.parse_date_code(v);
  return p ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : String(v);
};

// "41×15, 42×15" / "BW×30s" / "BW×?"  →  [{w, r}] or [{w, sec}]
function parseSetDetail(s) {
  if (!s || typeof s !== 'string') return null;
  const out = [];
  for (const part of s.split(', ')) {
    const m = part.match(/^(BW|[\d.]+)×(\?|[\d.]+s?)$/); if (!m) return null;
    const w = m[1] === 'BW' ? null : Number(m[1]);
    if (m[2].endsWith('s')) out.push({ w, sec: Number(m[2].slice(0, -1)) });
    else out.push({ w, r: m[2] === '?' ? null : Number(m[2]) });
  }
  return out.length ? out : null;
}

function slugFor(name, taken) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'exercise';
  let id = base, n = 2;
  while (EX[id] || (taken[id] && taken[id].n !== name)) id = `${base}-${n++}`;
  return id;
}

// Same fields as the app writes, so an entry that's already here isn't added twice.
export const entryKey = e => JSON.stringify([e.d, e.ph || null, e.w ?? null, e.s ?? null, e.r ?? null, e.sec ?? null, e.sets || null, e.n || null]);

// Sessions rows (the Sessions sheet's columns, header first) → logs, new custom exercises and muscle tags.
function readSessions(X, sessions, cfg) {
  // Exercise names → ids: built-in names, then your custom exercises, then new custom ones.
  const known = { ...(cfg.ex || {}) }; const byName = {};
  Object.entries(EX).forEach(([id, e]) => { byName[e.n] = id; });
  Object.entries(known).forEach(([id, e]) => { if (e && e.n && !byName[e.n]) byName[e.n] = id; });
  const newEx = {};
  const idFor = name => {
    if (byName[name]) return byName[name];
    if (EX[name] || known[name]) return name; // exported with a missing name, the id was used instead
    const id = slugFor(name, { ...known, ...newEx }); newEx[id] = { n: name }; byName[name] = id; return id;
  };

  const logs = {}; const tags = {}; let skipped = 0;
  for (const r of sessions.slice(1)) {
    const [d0, wk0, name, phase, w, s, reps, hold, detail, , prim, sec, note, slot, exId] = r.map(v => (typeof v === 'string' ? v.trim() : v));
    const d = dateText(X, d0), wk = dateText(X, wk0);
    if (!DATE_RE.test(String(d)) || !name) { skipped++; continue; }
    const id = exId ? String(exId) : idFor(String(name));
    const e = { d: String(d), ph: phaseKey(phase), w: num(w), s: num(s) };
    if (num(hold) != null) e.sec = num(hold); else e.r = num(reps);
    const sets = parseSetDetail(detail); if (sets) e.sets = sets;
    if (note === AUTO_NOTE) e.auto = true; else if (note) e.n = String(note);
    if (slot) e.slot = String(slot);
    if (WEEK_RE.test(String(wk))) e.wk = String(wk);
    (logs[id] = logs[id] || []).push(e);
    if (!tags[id]) tags[id] = { prim: String(prim || ''), sec: String(sec || '') };
  }
  Object.values(logs).forEach(L => L.sort((a, b) => a.d.localeCompare(b.d)));

  // Muscle tags, only where they differ from the built-in ones (e.g. new exercises or ones you re-tagged).
  const muscleMap = {};
  Object.entries(tags).forEach(([id, t]) => {
    const tg = t.prim === 'Mobility' ? { mob: true } : { p: t.prim.split(', ').map(muscleKey).filter(Boolean), s: t.sec.split(', ').map(muscleKey).filter(Boolean) };
    if (!tg.mob && !tg.p.length && !tg.s.length) return;
    const def = MUSCLE_MAP[id];
    const same = def && JSON.stringify({ mob: !!def.mob, p: def.p || [], s: def.s || [] }) === JSON.stringify({ mob: !!tg.mob, p: tg.p || [], s: tg.s || [] });
    if (!same) muscleMap[id] = tg;
  });
  return { logs, newEx, muscleMap, skipped, idFor };
}

export async function parseExcelExport(buffer, cfg) {
  const X = await loadXLSX();
  let wb;
  try { wb = X.read(buffer, { type: 'array' }); } catch { throw new Error('That file couldn’t be read as an Excel workbook.'); }
  const rows = name => (wb.Sheets[name] ? X.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true }) : null);
  const sessions = rows('Sessions');
  if (!sessions || String(sessions[0]?.[2]) !== 'Exercise' || String(sessions[0]?.[0]) !== 'Date') {
    if (rows('Plan')) throw new Error('That’s a single-week Excel file. Import the main iron-log workbook, or better, the iron-log-data .json file.');
    throw new Error('That isn’t an Iron Log Excel export.');
  }

  const { logs, newEx, muscleMap, skipped, idFor } = readSessions(X, sessions, cfg);

  const body = [];
  (rows('Body weight') || []).slice(1).forEach(([wk0, d0, w]) => {
    const wk = dateText(X, wk0), d = dateText(X, d0);
    if (WEEK_RE.test(String(wk)) && DATE_RE.test(String(d)) && num(w) > 0 && !body.some(x => x.wk === wk)) body.push({ wk: String(wk), d: String(d), w: num(w) });
  });

  const config = { rm: {}, ex: newEx, muscleMap, progNames: {} };
  const settings = {}; let exportedAt;
  (rows('Settings') || []).slice(1).forEach(([k, v]) => {
    k = String(k);
    if (k === 'Mode' && [1, 2, 3].includes(num(v))) settings.mode = num(v);
    else if (k === 'Rest between sets (s)' && num(v) >= 0) settings.rest = num(v);
    else if (/^Program [AB] name$/.test(k) && v && v !== `Program ${k[8]}`) config.progNames[k[8]] = String(v).slice(0, 40);
    else if (k.startsWith('1RM: ') && num(v) > 0) config.rm[idFor(k.slice(5))] = num(v);
    else if (k === 'Exported') exportedAt = String(v);
    else { const p = PH_KEYS.find(key => k === `${PHASES[key].label} % of 1RM`); if (p && num(v) != null) (settings.pct = settings.pct || {})[p] = num(v); }
  });

  const excel = { settings, skipped, newExercises: Object.values(newEx).map(e => e.n) };
  const full = readDataSheets(X, rows);
  if (full) {
    // A whole-backup workbook: every table is there, so it imports exactly like the JSON data file.
    const data = normalizeData({ ...full, exportedAt, logs, body });
    return { ...data, excel: { ...excel, complete: true } };
  }
  return { exportedAt, config, programs: {}, library: [], logs, weeks: {}, body, excel };
}

const str = v => (v == null ? '' : String(v));
const put = (o, k, v) => { if (v !== '' && v != null) o[k] = v; };
function readProgram(rows, warm) {
  const days = [];
  rows.forEach(r => {
    const [, day, title, sub, makeup, slotNo, id, sec, tier, type, note, ex, , ph, w, bw, rx, itemNote] = r;
    const di = num(day) - 1; if (!(di >= 0)) return;
    const d = days[di] = days[di] || { title: str(title), slots: [] };
    put(d, 'sub', str(sub)); if (str(makeup) === 'Yes') d.makeup = true;
    if (!num(slotNo)) return;
    const s = d.slots[num(slotNo) - 1] = d.slots[num(slotNo) - 1] || { items: [] };
    put(s, 'id', str(id)); put(s, 'sec', str(sec)); put(s, 'tier', str(tier)); put(s, 'type', str(type)); put(s, 'note', str(note));
    if (!ex) return;
    const it = { ex: str(ex), ph: str(ph) || null, w: num(w) };
    if (str(bw) === 'Yes') it.bw = true; put(it, 'rx', str(rx)); put(it, 'note', str(itemNote));
    s.items.push(it);
  });
  for (let i = 0; i < days.length; i++) { days[i] = days[i] || { title: `Day ${i + 1}`, slots: [] }; days[i].slots = days[i].slots.filter(Boolean); }
  const prog = { days };
  if (warm) prog.warm = warm;
  return prog;
}
function readWeeks(X, rows) {
  const weeks = {};
  rows.forEach(([wk0, kind, key, v]) => {
    const wk = dateText(X, wk0); if (!WEEK_RE.test(wk)) return;
    const w = weeks[wk] = weeks[wk] || normWeek();
    key = str(key);
    if (kind === 'prog') w.prog = str(v);
    else if (kind === 'rest') { const n = num(v); if (n >= 1) w.rest = n; }
    else if (kind === 'done' || kind === 'skipped') w[kind][key] = true;
    else if (kind === 'moved') w.moved[key] = num(v);
    else if (kind === 'phase') w.ph[key] = str(v);
    else if (kind === 'warm') { const [day, item] = key.split('/'); (w.warm[day] = w.warm[day] || {})[item] = str(v) === 'Yes'; }
  });
  return weeks;
}
// The data sheets of a whole-backup workbook, as a data-file-shaped object; null for older workbooks without them.
function readDataSheets(X, rows) {
  const prog = rows('Programs'), info = rows('Program info'), lib = rows('Saved versions'), checks = rows('Check-offs'), conf = rows('Config');
  if (!prog || !info || !lib || !checks || !conf) return null;
  const warms = Object.fromEntries(info.slice(1).map(([o, w]) => [str(o), str(w)]));
  const owners = {}; prog.slice(1).forEach(r => { (owners[str(r[0])] = owners[str(r[0])] || []).push(r); });
  const programs = {}; ['A', 'B'].forEach(k => { if (owners[k]) programs[k] = readProgram(owners[k], warms[k]); });
  const library = lib.slice(1).filter(r => r[0] !== '').map(([id, name, from, at, auto, created]) => {
    const it = { id: str(id), name: str(name), at: str(at), prog: readProgram(owners[str(id)] || [], warms[str(id)]) };
    put(it, 'from', str(from)); if (str(auto) === 'Yes') it.auto = true; if (str(created) === 'Yes') it.created = true; return it;
  });
  const config = {};
  conf.slice(1).forEach(([k, v]) => { try { config[str(k)] = JSON.parse(str(v)); } catch { /* skip an unreadable setting */ } });
  return { config, programs, library, weeks: readWeeks(X, checks.slice(1)) };
}

// A workbook has no check-offs, but every session names the program slot it was logged from, so each
// one checks its exercise off in the week it was logged. `weeks` are the saved weeks here, which decide
// the program a week ran. Returns {weekKey: week} holding only those check-offs, ready to merge.
export function checkOffsFromLogs(cfg, programs, logs, weeks) {
  const out = {};
  Object.entries(logs).forEach(([ex, L]) => L.forEach(e => {
    if (!e.slot) return;
    const k = entryWeek(e); if (!WEEK_RE.test(k)) return;
    const w = out[k] || (out[k] = normWeek({ prog: weeks[k] && weeks[k].prog }));
    const prog = programs[activeProgKey(cfg, w, parseDate(k))] || programs.A;
    const s = slotsFor(prog).find(x => x.id === e.slot);
    const i = s ? s.items.findIndex(it => it.ex === ex) : -1;
    if (i >= 0) setItemDone(w, s, i, true);
  }));
  Object.keys(out).forEach(k => { if (!Object.keys(out[k].done).length) delete out[k]; });
  return out;
}

/* ---------- CSV (the iron-log.csv export), as a fallback: sessions only ---------- */
function csvRows(text) {
  const rows = []; let row = [], cell = '', q = false;
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
export async function parseCsvExport(text, cfg) {
  const X = await loadXLSX();
  const r = csvRows(text.replace(/^\uFEFF/, ''));
  const head = (r[0] || []).map(v => v.trim().toLowerCase());
  if (head[0] !== 'date' || head[1] !== 'exercise') throw new Error('That isn’t an Iron Log CSV export.');
  const at = n => head.indexOf(n);
  const sessions = [[], ...r.slice(1).map(c => {
    const g = n => (at(n) >= 0 ? c[at(n)] ?? '' : '');
    return [g('date'), g('week_of'), g('exercise'), g('phase'), g('weight_lb'), g('sets'), g('reps'), g('hold_s'), g('set_detail'), '', g('primary_muscles'), g('secondary_muscles'), g('note'), g('program_slot'), ''];
  })];
  const { logs, newEx, muscleMap, skipped } = readSessions(X, sessions, cfg);
  return { exportedAt: undefined, config: { rm: {}, ex: newEx, muscleMap, progNames: {} }, programs: {}, library: [], logs, weeks: {}, body: [], excel: { settings: {}, skipped, newExercises: Object.values(newEx).map(e => e.n), csv: true } };
}
