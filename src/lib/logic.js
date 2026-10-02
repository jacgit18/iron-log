import { PHASES, PH_KEYS, exInfo, DAY_COUNT } from './data.js';
import { monday, ymd, parseDate, addDays } from './dates.js';

/* ---------- Config defaults ---------- */
export const DEFAULT_CFG = { muscleMap: {}, ex: {}, mode: 1, m3Start: 1, m3First: 'A', m2Even: 'A', pct: { strength: 85, iso: 75, hyp: 65, exp: 45 }, rxOverride: {}, rm: {}, phDef: {} };

/* ---------- Program rotation ---------- */
export function programFor(cfg, date) {
  const m = date.getMonth() + 1; // 1..12
  if (cfg.mode === 2) { const even = m % 2 === 0; const evenProg = cfg.m2Even || 'A'; return even ? evenProg : (evenProg === 'A' ? 'B' : 'A'); }
  if (cfg.mode === 3) { const idx = Math.floor((((m - cfg.m3Start) % 12) + 12) % 12 / 6); return idx === 0 ? cfg.m3First : (cfg.m3First === 'A' ? 'B' : 'A'); }
  return 'A';
}
export const progName = (cfg, k) => (cfg.progNames && cfg.progNames[k]) || `Program ${k}`;
export function activeProgKey(cfg, week, weekStart) { return (cfg.mode === 2 && (week.prog === 'A' || week.prog === 'B')) ? week.prog : programFor(cfg, weekStart); }

/* ---------- Small helpers ---------- */
export const round = w => w < 50 ? Math.round(w / 2.5) * 2.5 : Math.round(w / 5) * 5;
export const itemKey = (slot, idx) => `${slot.id}:${idx}`;
export function phaseOf(cfg, week, slot, idx) { const k = itemKey(slot, idx); return week.ph[k] ?? cfg.phDef[k] ?? slot.items[idx].ph ?? null; }
export function rxOf(cfg, item, ph) { if (item.rx && ph === item.ph) return item.rx; if (ph) return cfg.rxOverride[ph] || PHASES[ph].rx; return item.rx || ''; }

// Stall: the last 3 sessions of a lift in one phase (one per day) never went above the first of them in weight,
// the latest didn't beat the first on total reps (or hold time), and they span at least 2 different weeks. Not flagged when the app is already suggesting a heavier weight.
// Both use only sessions you logged yourself: check-offs log the target, so counting them would raise
// the suggested weight on check-offs alone and call a lift stalled that you never logged.
export function stallOf(cfg, logs, exId, ph) {
  const byDay = {}; (logs[exId] || []).filter(e => !e.auto && (e.ph || null) === (ph || null)).forEach(e => { byDay[e.d] = e; });
  const L = Object.keys(byDay).sort().map(d => byDay[d]).slice(-3);
  if (L.length < 3 || L.some(e => !(Number(e.w) > 0))) return null;
  const w0 = Number(L[0].w); if (L.some(e => Number(e.w) > w0)) return null;
  if (new Set(L.map(e => e.wk || ymd(monday(parseDate(e.d))))).size < 2) return null;
  const work = e => setsOfEntry(e).reduce((a, x) => a + (Number(x.sec ?? x.r) || 0), 0); // total reps (or hold seconds)
  if (Number(L[2].w) === w0 && work(L[2]) > work(L[0])) return null; // same weight but more reps: still progressing
  if (progressionOf(cfg, logs, { ex: exId }, ph)) return null;
  return { w: Number(L[2].w), since: L[0].d, n: 3 };
}
export function progressionOf(cfg, logs, item, ph) {
  const byDay = {}; (logs[item.ex] || []).filter(e => !e.auto && (e.ph || null) === (ph || null)).forEach(e => { byDay[e.d] = e; });
  const L = Object.keys(byDay).sort().map(d => byDay[d]);
  if (L.length < 2) return null;
  const [a, b] = L.slice(-2); const w = Number(b.w);
  if (!(w > 0) || !(Number(a.w) >= w)) return null;
  const m = rxOf(cfg, item, ph).match(/(\d+)\s*×\s*(\d+)/); if (!m) return null;
  const sets = Number(m[1]), reps = Number(m[2]);
  const full = e => setsOfEntry(e).filter(x => Number(x.w) >= w && (ph === 'iso' ? Number(x.sec) >= 30 : Number(x.r) >= reps)).length >= sets;
  if (!full(a) || !full(b)) return null;
  return { w: w + (w < 50 ? 2.5 : 5), from: w };
}
export function targetOf(cfg, logs, item, ph) {
  const base = baseTargetOf(cfg, logs, item, ph); const up = progressionOf(cfg, logs, item, ph);
  if (up && (base.w == null || up.w > base.w)) return { w: up.w, src: `up from ${up.from} lb`, up: true };
  return base;
}
export function baseTargetOf(cfg, logs, item, ph) {
  const rm = cfg.rm[item.ex];
  if (rm && ph) { return { w: round(rm * (cfg.pct[ph] ?? PHASES[ph].pct) / 100), src: `${cfg.pct[ph] ?? PHASES[ph].pct}% of 1RM` }; }
  const last = lastLog(logs, item.ex, ph);
  if (last && last.w != null && last.w !== '' && Number(last.w) > 0) return { w: Number(last.w), src: 'last session' };
  if (item.w != null) return { w: item.w, src: 'program' };
  if (item.bw) return { w: null, src: 'bodyweight' };
  return { w: null, src: '' };
}
export const lastLog = (logs, exId, ph) => { const l = (logs[exId] || []).filter(e => ph === undefined || (e.ph || null) === (ph || null)); return l.length ? l[l.length - 1] : null; };

// One lift can run in several phases (Chest Press: Strength on one day, Hypertrophy on another), so the
// 1RM table lists weights per phase: [{ph, w}], in phase order, "no phase" last.
const phaseOrder = ph => (ph ? PH_KEYS.indexOf(ph) : PH_KEYS.length);
const byPhase = (a, b) => phaseOrder(a.ph) - phaseOrder(b.ph) || a.w - b.w;
export function programWeights(cfg, slots, exId) {
  const out = [];
  slots.forEach(s => s.items.forEach((it, i) => {
    if (it.ex !== exId || it.w == null) return;
    const ph = cfg.phDef[itemKey(s, i)] ?? it.ph ?? null;
    if (!out.some(x => x.ph === ph && x.w === it.w)) out.push({ ph, w: it.w });
  }));
  return out.sort(byPhase);
}
export function bestByPhase(entries) {
  const best = {};
  (entries || []).forEach(e => { const w = Number(e.w); const ph = e.ph || null; if (w > 0 && !(best[ph] >= w)) best[ph] = w; });
  return Object.keys(best).map(k => ({ ph: k === 'null' ? null : k, w: best[k] })).sort(byPhase);
}

/* ---------- Per-set logging ----------
   An entry keeps each set in e.sets: [{w, r}] (or [{w, sec}] for holds). It also keeps summary fields that
   the rest of the app reads: w = heaviest weight, s = number of sets, r / sec = the lowest reps / hold,
   so "every set hit the target" is simply r >= target. Older entries have only the summary fields. */
export function summarizeSets(sets, iso) {
  const ws = sets.map(x => x.w).filter(v => v != null);
  const out = { w: ws.length ? Math.max(...ws) : null, s: sets.length };
  const vals = sets.map(x => iso ? x.sec : x.r).filter(v => v != null);
  if (vals.length) out[iso ? 'sec' : 'r'] = Math.min(...vals);
  out.sets = sets; return out;
}
export function setsOfEntry(e) {
  if (Array.isArray(e.sets) && e.sets.length) return e.sets;
  const n = Number(e.s) || 0; const w = (e.w === '' || e.w == null) ? null : Number(e.w);
  return Array.from({ length: n }, () => e.sec != null ? { w, sec: Number(e.sec) } : { w, r: e.r == null ? null : Number(e.r) });
}
export const setVal = x => x.sec != null ? `${x.sec}s` : (x.r ?? '?');
export const isUniform = e => { const S = e.sets; return !S || S.length < 2 || S.every(x => x.w === S[0].w && x.r === S[0].r && x.sec === S[0].sec); };
export function volText(e) {
  if (isUniform(e)) return e.sec ? `${e.s || '?'} × ${e.sec}s` : `${e.s || '?'} × ${e.r || '?'}`;
  const S = e.sets; if (S.every(x => x.w === S[0].w)) return S.map(setVal).join(', ');
  const groups = []; S.forEach(x => { const g = groups[groups.length - 1]; if (g && g.w === x.w) g.v.push(setVal(x)); else groups.push({ w: x.w, v: [setVal(x)] }); });
  return groups.map(g => `${g.w != null ? g.w + ' lb' : 'bodyweight'} × ${g.v.join(', ')}`).join(' · ');
}
export function describe(e) {
  if (!e) return '';
  const S = e.sets; if (!isUniform(e) && !S.every(x => x.w === S[0].w)) return volText(e);
  const load = e.w != null && e.w !== '' ? `${e.w} lb` : 'bodyweight'; return `${load} · ${volText(e)}`;
}

/* ---------- What counts: the one rule every count in the app uses ---------- */
export const isSkipped = (s, w) => !!(w.skipped && w.skipped[s.id]);
// Done state lives in week.done: done[id] = the whole card is done; done[`${id}#${i}`] = one exercise
// in a paired card (a superset half, or the either/or option that was picked).
export const itemKey2 = (s, i) => `${s.id}#${i}`;
export const isPaired = s => s.type === 'superset' || s.type === 'either';
export function isItemDone(s, i, w) {
  const d = w.done || {};
  if (!isPaired(s)) return !!d[s.id];
  if (d[itemKey2(s, i)]) return true;
  if (!d[s.id]) return false;
  if (s.type === 'superset') return true;
  return i === 0 && !s.items.some((_, j) => d[itemKey2(s, j)]); // either/or done without a recorded pick: show the first
}
export function isDone(s, w) {
  const d = w.done || {}; if (d[s.id]) return true;
  if (s.type === 'superset') return s.items.every((_, i) => d[itemKey2(s, i)]);
  if (s.type === 'either') return s.items.some((_, i) => d[itemKey2(s, i)]);
  return false;
}
export const isOpen = (s, w) => !isDone(s, w) && !isSkipped(s, w); // still to do this week
// How many units a card adds to a total, and how many of those are done:
// a superset counts each exercise, an either/or counts once, a single card counts once.
export const unitsOf = s => s.type === 'superset' ? s.items.length : 1;
export const doneUnitsOf = (s, w) => s.type === 'superset' ? s.items.filter((_, i) => isItemDone(s, i, w)).length : (isDone(s, w) ? 1 : 0);

export function clearDone(week, s) { if (!week.done) return; delete week.done[s.id]; s.items.forEach((_, i) => delete week.done[itemKey2(s, i)]); }
export function setCardDone(week, s, on) { clearDone(week, s); if (on) { week.done[s.id] = true; if (week.skipped) delete week.skipped[s.id]; } }
export function setItemDone(week, s, idx, on) {
  if (!isPaired(s)) return setCardDone(week, s, on);
  if (s.type === 'superset') {
    const cur = s.items.map((_, i) => isItemDone(s, i, week)); cur[idx] = on; clearDone(week, s);
    if (cur.every(Boolean)) week.done[s.id] = true; else cur.forEach((v, i) => { if (v) week.done[itemKey2(s, i)] = true; });
  } else { clearDone(week, s); if (on) { week.done[s.id] = true; week.done[itemKey2(s, idx)] = true; } }
  if (on && week.skipped) delete week.skipped[s.id];
}
// Totals for any list of cards. Skipped cards are left out of total and done.
export function tally(slots, w) {
  let total = 0, done = 0, skipped = 0;
  slots.forEach(s => { if (isSkipped(s, w)) { skipped++; return; } total += unitsOf(s); done += doneUnitsOf(s, w); });
  return { total, done, skipped, full: total > 0 && done === total };
}
/* ---------- Days and the rest day ----------
   week.rest = N inserts a rest day at displayed position N: workouts on program days N and later
   show one day later. The layout is derived, so nothing stored changes and unticking undoes it. */
export const DAYS = Array.from({ length: DAY_COUNT }, (_, i) => i + 1);
export const shownDay = (rest, d) => (rest && d >= rest ? Math.min(d + 1, DAY_COUNT) : d);
export const programDay = (rest, d) => (!rest || d < rest ? d : d === rest ? null : d - 1);
// week.order[i] = the program day shown at workout position i + 1 (absent = normal order).
export const isOrder = o => Array.isArray(o) && o.length === DAY_COUNT && o.every(v => Number.isInteger(v) && v >= 1 && v <= DAY_COUNT) && new Set(o).size === DAY_COUNT;
export const orderOf = w => (w && isOrder(w.order) ? w.order : DAYS);
export const posOf = (w, d) => orderOf(w).indexOf(d) + 1;
export const colOf = (w, d) => shownDay(w.rest, posOf(w, d)); // displayed column of a program day
export const dayAt = (w, c) => { const p = programDay(w.rest, c); return p == null ? null : orderOf(w)[p - 1]; }; // program day shown in column c; null on the rest column
export const dayTitle = (day, d) => (!day.title || /^Day \d+$/.test(day.title) ? `Day ${d}` : day.title);
// The shift would push a workout off the board when something sits in the last workout position.
export const restBlocked = (week, slots) => slots.some(s => posOf(week, (week.moved && week.moved[s.id]) || s.day) === DAY_COUNT);
export function currentLayout(week, slots) {
  const cols = Object.fromEntries(DAYS.map(d => [d, []]));
  slots.forEach(s => cols[colOf(week, (week.moved && week.moved[s.id]) || s.day)].push(s));
  return cols;
}

// Same exercise already on the target day, the day before, or the day after (skipped cards don't count).
export function moveClashes(cfg, week, slots, s, day) {
  const cols = currentLayout(week, slots); const out = [];
  [[day, 'the same day'], [day + 1, 'the day after'], [day - 1, 'the day before']].forEach(([d, rel]) => {
    if (!cols[d]) return;
    cols[d].forEach(o => {
      if (o.id === s.id || isSkipped(o, week)) return;
      s.items.forEach((it, i) => {
        o.items.forEach((ot, j) => {
          if (ot.ex !== it.ex) return;
          const p = phaseOf(cfg, week, o, j), q = phaseOf(cfg, week, s, i);
          const ph = p ? ` (${PHASES[p].label}${q && q !== p ? ` there, ${PHASES[q].label} here` : ''})` : '';
          const name = exInfo(cfg, it.ex).n;
          out.push(d === day ? `${name} is already on Day ${d}${ph}, so you'd train it twice that day.` : `${name} is also on Day ${d}${ph}, ${rel}, so you'd train it on back-to-back days.`);
        });
      });
    });
  });
  return [...new Set(out)];
}

export function holdPlan(cfg, week, logs, slot, idx) {
  const it = slot.items[idx]; const ph = phaseOf(cfg, week, slot, idx); const rx = rxOf(cfg, it, ph);
  const m = rx.match(/(\d+)\s*×\s*(\d+)(?:\s*[–-]\s*(\d+))?/); const sets = m ? Number(m[1]) : 4;
  const last = lastLog(logs, it.ex, 'iso'); const hold = (last && last.sec) ? Number(last.sec) : (m ? Number(m[2]) : 30);
  return { sets, hold };
}

// Starting set rows for the log sheet: the prescription's set count, prefilled with the target.
export function planRows(cfg, logs, it, ph) {
  const iso = ph === 'iso'; const m = rxOf(cfg, it, ph).match(/(\d+)\s*×\s*(\d+)/); const n = m ? Number(m[1]) : 3; const t = targetOf(cfg, logs, it, ph);
  const reps = m ? Number(m[2]) : null; const hold = iso ? ((lastLog(logs, it.ex, 'iso') || {}).sec || reps) : null;
  return Array.from({ length: n }, () => iso ? { w: t.w ?? null, sec: hold } : { w: t.w ?? null, r: reps });
}

/* ---------- Check-offs log the plan ----------
   Checking an exercise off without logging it records the target shown on its card (marked auto), so it
   shows in Progress. Unchecking removes that entry, and logging real numbers for the slot that week
   replaces it. Returns only the exercises whose entries changed: {exId: entries}. */
export const AUTO_NOTE = 'From check-off';
const weekOfEntry = e => e.wk || ymd(monday(parseDate(e.d)));
export function autoLogs(cfg, logs, slots, before, after, wk, date) {
  const out = {};
  slots.forEach(s => s.items.forEach((it, i) => {
    const was = isItemDone(s, i, before), now = isItemDone(s, i, after);
    if (was === now) return;
    const L = out[it.ex] || logs[it.ex] || [];
    const here = e => e.slot === s.id && weekOfEntry(e) === wk;
    if (now) {
      if (L.some(here)) return; // already logged for this card this week
      const ph = phaseOf(cfg, after, s, i);
      const e = { d: date, ph, ...summarizeSets(planRows(cfg, logs, it, ph), ph === 'iso'), slot: s.id, wk, auto: true };
      out[it.ex] = [...L, e].sort((a, b) => a.d.localeCompare(b.d));
    } else {
      const keep = L.filter(e => !(e.auto && here(e)));
      if (keep.length !== L.length) out[it.ex] = keep;
    }
  }));
  return out;
}

// Today when viewing the current week (or the day after it ends), otherwise the viewed week's Sunday.
// Compared as dates, not instants, so the whole of that next day counts.
export function defaultLogDate(weekStart) { const today = ymd(new Date()); return (today >= ymd(weekStart) && today <= ymd(addDays(weekStart, 7))) ? today : ymd(weekStart); }

export const normWeek = w => {
  const out = { prog: (w && w.prog) || null, done: { ...(w && w.done) }, skipped: { ...(w && w.skipped) }, moved: { ...(w && w.moved) }, ph: { ...(w && w.ph) }, warm: JSON.parse(JSON.stringify((w && w.warm) || {})) };
  const rest = Number(w && w.rest);
  if (Number.isInteger(rest) && rest >= 1 && rest <= DAY_COUNT) out.rest = rest;
  if (isOrder(w && w.order) && w.order.some((v, i) => v !== i + 1)) out.order = [...w.order];
  return out;
};
