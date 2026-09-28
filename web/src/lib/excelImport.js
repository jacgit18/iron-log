/* ---------- Recover data from an Iron Log Excel export (iron-log-YYYY-MM-DD.xlsx) ----------
   The workbook is a report, not a backup: it has every logged session, body weight and the main
   settings, but not weekly check-offs, edited programs, saved versions or phase defaults. This turns
   what it does have into the same shape as a parsed JSON data file, so the normal merge can add it. */
import { EX, PHASES, PH_KEYS } from './data.js';
import { MUSCLES, MUSCLE_MAP } from './muscles.js';
import { WEEK_RE } from './trends.js';
import { loadXLSX } from './export.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const num = v => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
const phaseKey = label => PH_KEYS.find(k => PHASES[k].label === label) || null;
const muscleKey = name => Object.keys(MUSCLES).find(k => MUSCLES[k].n === name);

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
    const [d, wk, name, phase, w, s, reps, hold, detail, , prim, sec, note, slot] = r.map(v => (typeof v === 'string' ? v.trim() : v));
    if (!DATE_RE.test(String(d)) || !name) { skipped++; continue; }
    const id = idFor(String(name));
    const e = { d: String(d), ph: phaseKey(phase), w: num(w), s: num(s) };
    if (num(hold) != null) e.sec = num(hold); else e.r = num(reps);
    const sets = parseSetDetail(detail); if (sets) e.sets = sets;
    if (note) e.n = String(note);
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

  const body = [];
  (rows('Body weight') || []).slice(1).forEach(([wk, d, w]) => {
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

  return { exportedAt, config, programs: {}, library: [], logs, weeks: {}, body, excel: { settings, skipped, newExercises: Object.values(newEx).map(e => e.n) } };
}
