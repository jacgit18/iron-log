import { addDays, fmtShort, parseDate, ymd } from '../shared/dates.js';
import { bwSorted } from '../lib/body.js';
import { nowStamp, validBodyLb } from '../shared/validate.js';
import type { BodySlice, Flag, StoreGet, StoreSet } from './types.ts';

// Body weight and the body-weight goal: one weigh-in per week, the goal kept in the config (cfg.bwGoal).
export const bodySlice = (set: StoreSet, get: StoreGet, flag: Flag): BodySlice => ({
  saveBodyWeight(v) {
    if (get().blocked()) return false;
    const n = Number(v); if (!validBodyLb(n)) { flag('Enter your weight in lb'); return false; }
    const wk = get().weekKey(); const today = ymd(new Date());
    const d = (today >= wk && today <= ymd(addDays(get().weekStart, 6))) ? today : wk;
    set(state => ({ body: [...state.body.filter(e => e.wk !== wk), { wk, d, w: Math.round(n * 10) / 10, updatedAt: nowStamp() }].sort((a, b) => a.wk.localeCompare(b.wk)) })); // sort-ok: ISO date strings
    get().saveBody();
    const g = get().cfg.bwGoal; if (g && !g.start) get().mutateCfg(c => { c.bwGoal = { ...g, start: { w: Math.round(n * 10) / 10, d } }; }); // first weigh-in after setting a goal
    flag('Body weight saved'); return true;
  },
  // Target body weight, optionally by a date. Where you are now is kept as the starting point for progress.
  setBodyGoal(raw, by) {
    if (get().blocked()) return false;
    const n = Number(raw); if (!validBodyLb(n)) { flag('Enter a target weight in lb'); return false; }
    if (by && !/^\d{4}-\d{2}-\d{2}$/.test(by)) { flag('Enter the goal date as a date'); return false; }
    const L = bwSorted(get().body); const last = L[L.length - 1];
    const goal = { w: Math.round(n * 10) / 10, ...(last ? { start: { w: last.w, d: last.d } } : {}), ...(by ? { by } : {}) };
    get().mutateCfg(c => { c.bwGoal = goal; }); flag('Goal saved'); return true;
  },
  clearBodyGoal() {
    const g = get().cfg.bwGoal; if (!g || !get().mutateCfg(c => { delete c.bwGoal; })) return;
    get().noteRemoved('body', `your ${g.w} lb goal`, () => !get().cfg.bwGoal && get().mutateCfg(c => { c.bwGoal = g; }));
  },
  deleteBodyWeight(wk) {
    if (get().blocked()) return;
    const gone = get().body.find(x => x.wk === wk); if (!gone) return;
    set(state => ({ body: state.body.filter(x => x.wk !== wk) })); get().saveBody();
    // Undo only if that week has not been weighed again since.
    get().noteRemoved('body', `the ${fmtShort(parseDate(gone.d))} weigh-in`, () => {
      if (get().blocked() || get().body.some(x => x.wk === wk)) return false;
      set(state => ({ body: [...state.body, gone].sort((a, b) => a.wk.localeCompare(b.wk)) })); get().saveBody(); return true; // sort-ok: ISO date strings
    });
  },
});
