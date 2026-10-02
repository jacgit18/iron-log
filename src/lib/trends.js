import { BUILTIN, slotsFor, exInfo } from './data.js';
import { monday, ymd, parseDate, addDays } from './dates.js';
import { programFor, tally, currentLayout, DAYS } from './logic.js';
import { M_KEYS, tagsOf } from './muscles.js';

export const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;
export const weekOfDate = d => ymd(monday(parseDate(d)));
export const entryWeek = e => e.wk || weekOfDate(e.d);
export const mdLabel = k => { const d = parseDate(k); return `${d.getMonth() + 1}/${d.getDate()}`; };
const setsOf = e => { const n = Number(e.s); return n > 0 ? n : 0; };
export const niceStep = max => [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find(s => max / s <= 4) || 1000;

// Totals for any saved week, using the program that week ran.
export function weekSummary(cfg, programs, key, w) {
  const start = parseDate(key);
  const pk = (cfg.mode === 2 && (w.prog === 'A' || w.prog === 'B')) ? w.prog : programFor(cfg, start);
  const prog = programs[pk] || programs.A || BUILTIN.A; const slots = slotsFor(prog);
  const cols = currentLayout({ ...w, moved: w.moved || {} }, slots);
  const days = DAYS.map(d => { if (d === w.rest && !cols[d].length) return 2; const t = tally(cols[d], w); return t.full ? 2 : t.done > 0 ? 1 : 0; });
  const t = tally(slots, w);
  return { key, start, pk, days, full: days.filter(x => x === 2).length, ex: t.done, total: t.total, skipped: t.skipped };
}

// Week keys for the charts: up to `max` weeks ending this week, starting no earlier than the first logged week (min `min` columns).
export function trendWeeks(logs, max, min) {
  const thisSun = ymd(monday(new Date()));
  let first = thisSun; Object.values(logs).forEach(L => L.forEach(e => { const k = entryWeek(e); if (k < first) first = k; }));
  const keys = []; let d = parseDate(thisSun);
  while (keys.length < max && (ymd(d) >= first || keys.length < min)) { keys.unshift(ymd(d)); d = addDays(d, -7); }
  return keys;
}
export function setsByWeek(logs, keys) {
  const out = {}; keys.forEach(k => { out[k] = { sets: 0, sessions: 0 }; });
  Object.values(logs).forEach(L => L.forEach(e => { const r = out[entryWeek(e)]; if (r) { r.sets += setsOf(e); r.sessions++; } }));
  return out;
}
export function muscleWeeks(cfg, logs, keys) {
  const out = {}; M_KEYS.forEach(m => { out[m] = {}; keys.forEach(k => { out[m][k] = 0; }); });
  Object.entries(logs).forEach(([id, L]) => {
    const tg = tagsOf(cfg, id); if (!tg || tg.mob) return;
    L.forEach(e => {
      const k = entryWeek(e); if (!(k in out[M_KEYS[0]])) return; const s = setsOf(e);
      (tg.p || []).forEach(m => { if (out[m]) out[m][k] += s; }); (tg.s || []).forEach(m => { if (out[m]) out[m][k] += s / 2; });
    });
  });
  return out;
}
// First vs latest working weight per exercise and phase, over the window.
export function weightChanges(cfg, logs, sinceKey) {
  const rows = [];
  Object.entries(logs).forEach(([id, L]) => {
    const by = {}; L.forEach(e => { const w = Number(e.w); if (!(w > 0) || entryWeek(e) < sinceKey) return; (by[e.ph || ''] = by[e.ph || ''] || []).push(e); });
    Object.entries(by).forEach(([ph, E]) => {
      if (E.length < 2) return; E = [...E].sort((a, b) => a.d.localeCompare(b.d));
      const a = E[0], b = E[E.length - 1]; const w0 = Number(a.w), w1 = Number(b.w);
      if (a.d === b.d) return;
      rows.push({ id, ph: ph || null, w0, w1, d0: a.d, d1: b.d, n: E.length, pct: (w1 - w0) / w0 * 100 });
    });
  });
  return rows.sort((x, y) => y.pct - x.pct || exInfo(cfg, x.id).n.localeCompare(exInfo(cfg, y.id).n));
}
