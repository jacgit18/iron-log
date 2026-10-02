export const bwSorted = body => [...body].filter(e => e && e.wk && Number(e.w) > 0).sort((a, b) => a.wk.localeCompare(b.wk));
export const fmtLb = n => `${Math.round(Number(n) * 10) / 10}`;
export const signed = (n, dp = 0) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(dp)}`;

/* ---------- Body weight goal ----------
   cfg.bwGoal = { w, start: {w, d}, by? }: the target, where you were when you set it, and an optional date. */
const DAY_MS = 864e5;
export function goalStatus(goal, body, today) {
  if (!goal || !(Number(goal.w) > 0)) return null;
  const L = bwSorted(body); const last = L[L.length - 1] || null;
  const target = Number(goal.w);
  const start = goal.start && Number(goal.start.w) > 0 ? Number(goal.start.w) : last ? Number(last.w) : null;
  if (!last || start == null) return { target, last: null, by: goal.by || null };
  const now = Number(last.w); const dir = target < start ? 'lose' : target > start ? 'gain' : 'hold';
  const left = target - now; // negative: still to lose
  const reached = dir === 'lose' ? now <= target : dir === 'gain' ? now >= target : Math.abs(left) < 0.05;
  const pct = dir === 'hold' ? 100 : Math.max(0, Math.min(100, Math.round((start - now) / (start - target) * 100)));
  const out = { target, start, last, now, dir, left, reached, pct, by: goal.by || null };
  // Recent pace: change per week over about the last four weigh-ins.
  const base = L[Math.max(0, L.length - 5)];
  if (base !== last) { const weeks = (parseISO(last.d) - parseISO(base.d)) / (7 * DAY_MS); if (weeks > 0) out.pace = (now - Number(base.w)) / weeks; }
  if (goal.by && !reached) { const weeks = (parseISO(goal.by) - parseISO(ymdOf(today))) / (7 * DAY_MS); out.weeksLeft = weeks; if (weeks > 0) out.need = left / weeks; }
  return out;
}
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
const ymdOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
