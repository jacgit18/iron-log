import { trackNudge } from '../lib/dayNudge.js';
import { exInfo } from '../lib/data.js';
import { weekStartOf, ymd } from '../shared/dates.js';
import { DAYS, autoLogs, clearForSkip, colOf, currentLayout, dayAt, defaultLogDate, injuryPreventionOn, isFinished, isPaired, isSkipped, itemKey2, moveClashes, planFix, setCardDone, setItemDone, setItemSkipped, moveRestDates, orderOf, restDatesOf, restsOf } from '../lib/logic.js';
import type { FlatSlot, Logs, Week } from '../types.ts';
import type { BoardSlice, Flag, OrderNote, OrderState, StoreGet, StoreSet } from './types.ts';

// Write a day order and rest days onto a week (the normal order is stored as no order). each rest day keeps its date (the first rest keeps the first date).
const writeOrder = (w: Week, { order, rest }: { order: number[]; rest: number[] }) => {
  if (order.every((v, k) => v === k + 1)) delete w.order; else w.order = [...order];
  const dates = moveRestDates(restDatesOf(w), restsOf(w), rest);
  if (rest.length) w.rest = [...rest]; else delete w.rest;
  if (Object.keys(dates).length) w.restOn = dates; else delete w.restOn;
};
// One card's place for the week: `moved` is its week.moved value, null for its own day.
const writeMoved = (w: Week, { slot, moved }: { slot: string; moved: number | null }) => { if (moved == null) delete w.moved[slot]; else w.moved[slot] = moved; };
// What a suggestion note holds now: { order, rest } for a day order, { slot, moved } for one card.
const noteState = (n: OrderNote, w: Week): OrderState => (n.kind === 'card' ? { slot: n.next.slot, moved: w.moved[n.next.slot] ?? null } : { order: [...orderOf(w)], rest: restsOf(w) });
const sameState = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
// The note for a planFix result: `next` is what Apply writes, `prev` what Put back restores.
const noteFor = (plan: any, week: Week, slots: FlatSlot[], wk: string, doneCol: number): OrderNote => {
  const note = { kind: plan.kind, week: wk, doneCol, lines: plan.lines, applied: false };
  if (plan.kind === 'card') {
    const s = slots.find(x => x.id === plan.slot)!;
    return { ...note, prev: { slot: plan.slot, moved: week.moved[plan.slot] ?? null }, next: { slot: plan.slot, moved: plan.pd === s.day ? null : plan.pd } };
  }
  return { ...note, prev: { order: [...orderOf(week)], rest: restsOf(week) }, next: { order: plan.order, rest: plan.rest } };
};
const sameNote = (a: OrderNote, b: OrderNote) => sameState([a.kind, a.lines, a.next], [b.kind, b.lines, b.next]);

// Ticking, skipping and moving cards on the board, and the order suggestions that follow.
export const boardSlice = (set: StoreSet, get: StoreGet, flag: Flag): BoardSlice => ({
  // A change to check-offs from the board: exercises that became done log their planned numbers,
  // and ones that were unchecked (or skipped) lose that entry.
  // `removeLogged`: unticking a box also removes the entries you logged yourself for that card this week.
  // A box that was unticked leaves an Undo notice (`label` names what was unticked).
  mutateChecks(fn, { removeLogged = false, label = '' } = {}) {
    const slots = get().activeSlots(); const before = get().week; const logs = get().logs;
    if (!get().mutateWeek(fn)) return false;
    const changed = autoLogs(get().cfg, logs, slots, before, get().week, get().weekKey(), defaultLogDate(get().weekStart), { removeLogged });
    if (Object.keys(changed).length) {
      set(state => ({ logs: { ...state.logs, ...changed } }));
      Object.keys(changed).forEach(id => get().saveLog(id));
    }
    // Entries you logged yourself that this removed, kept so the uncheck can be undone.
    const entries: Logs = {}; let gone = 0;
    Object.keys(changed).forEach(id => {
      const kept = new Set(changed[id].map(e => JSON.stringify(e)));
      const lost = (logs[id] || []).filter(e => !e.auto && !kept.has(JSON.stringify(e)));
      if (lost.length) { entries[id] = lost; gone += lost.length; }
    });
    const done: Record<string, boolean> = {}; const after = get().week.done || {};
    new Set([...Object.keys(before.done || {}), ...Object.keys(after)]).forEach(k => { if (!!(before.done || {})[k] !== !!after[k]) done[k] = !!(before.done || {})[k]; });
    // A superset's per-exercise ticks fold into the card's own tick when its last half is ticked: that is not an uncheck.
    const stillDone = (k: string) => !!after[k] || (k.includes('#') && !!after[k.split('#')[0]]);
    const unticked = Object.entries(done).some(([k, was]) => was && !stillDone(k));
    get().suggestOrder(slots, before);
    if (get().weekKey() === ymd(weekStartOf(new Date()))) trackNudge(before, get().week, slots); // only this week's days are worth a nudge
    if (removeLogged && unticked) {
      const text = `Unchecked${label ? ' ' + label : ''}${gone ? ` · removed ${gone} logged ${gone === 1 ? 'entry' : 'entries'}` : ''}.`;
      set({ uncheckNote: { week: get().weekKey(), text, entries, done } });
    } else if (get().uncheckNote) set({ uncheckNote: null }); // any other check-off change replaces the old notice
    return true;
  },
  // A check-off change (tick or skip) that finished a column suggests a fix for the days ahead (planFix): moving the
  // rest day, one card, or the day order. A change that un-finishes that column drops one not yet applied.
  suggestOrder(slots, before) {
    const { cfg, week } = get(); const wk = get().weekKey();
    if (!injuryPreventionOn(cfg)) return;
    const a = currentLayout(week, slots), b = currentLayout(before, slots);
    // One not yet applied follows the board: redone for its day (a tick may have started a day it would move), or
    // dropped once that day isn't finished or nothing helps any more.
    const n = get().orderNote;
    if (n && !n.applied && n.week === wk) {
      const plan = isFinished(a[n.doneCol], week) && planFix(cfg, week, slots, n.doneCol);
      const fresh = plan && noteFor(plan, week, slots, wk, n.doneCol);
      if (!fresh) set({ orderNote: null }); else if (!sameNote(fresh, n)) set({ orderNote: fresh });
    }
    const doneCol = DAYS.find(c => isFinished(a[c], week) && !isFinished(b[c], before));
    if (doneCol == null || get().orderSkip.includes(`${wk}:${doneCol}`)) return;
    const plan = planFix(cfg, week, slots, doneCol);
    if (plan) set({ orderNote: noteFor(plan, week, slots, wk, doneCol) });
  },
  canUndoOrder() {
    const n = get().orderNote;
    return !!(n && n.applied && n.week === get().weekKey() && sameState(noteState(n, get().week), n.next));
  },
  applyOrder() {
    const n = get().orderNote; if (!n || n.applied || n.week !== get().weekKey()) return false;
    // Only while it still fits the board: a change it didn't see (another device, the week's program) drops it.
    const slots = get().activeSlots(); const plan = planFix(get().cfg, get().week, slots, n.doneCol);
    if (!plan || !sameNote(noteFor(plan, get().week, slots, n.week, n.doneCol), n)) { set({ orderNote: null }); flag('The board changed, so that suggestion no longer fits'); return false; }
    if (!get().mutateWeek(w => (n.kind === 'card' ? writeMoved(w, n.next) : writeOrder(w, n.next)))) return false;
    set({ orderNote: { ...n, applied: true }, moveNote: null });
    flag(n.kind === 'card' ? 'Moved for this week' : 'Order changed for this week');
    return true;
  },
  undoOrder() {
    const n = get().orderNote; if (!n || !get().canUndoOrder()) return false;
    if (!get().mutateWeek(w => (n.kind === 'card' ? writeMoved(w, n.prev) : writeOrder(w, n.prev)))) return false;
    set({ orderNote: null });
    flag(n.kind === 'card' ? 'Move put back' : 'Order put back');
    return true;
  },
  dismissOrder() {
    const n = get().orderNote; if (!n) return;
    set({ orderNote: null, orderSkip: n.applied ? get().orderSkip : [...get().orderSkip, `${n.week}:${n.doneCol}`] });
  },
  // Put back what the last uncheck removed: the entries, and the ticks.
  undoUncheck() {
    const n = get().uncheckNote; if (!n || n.week !== get().weekKey() || get().blocked()) return;
    set({ uncheckNote: null });
    const logs = { ...get().logs };
    Object.entries(n.entries).forEach(([id, lost]) => {
      const have = new Set((logs[id] || []).map(e => JSON.stringify(e)));
      logs[id] = [...(logs[id] || []), ...lost.filter(e => !have.has(JSON.stringify(e)))].sort((a, b) => a.d.localeCompare(b.d));
    });
    set({ logs }); Object.keys(n.entries).forEach(id => get().saveLog(id));
    // Ticking again through the check-off path, so a card without logged numbers gets its check-off entry back too.
    get().mutateChecks(w => { w.done = w.done || {}; Object.entries(n.done).forEach(([k, on]) => { if (on) w.done[k] = true; else delete w.done[k]; }); });
    flag('Put back');
  },
  dismissUncheck: () => set({ uncheckNote: null }),
  checkCard(slotId, on) { const s = get().slotById(slotId); if (s) get().mutateChecks(w => setCardDone(w, s, on), { removeLogged: true, label: s.items.map(it => exInfo(get().cfg, it.ex).n).join(' → ') }); },
  checkItem(slotId, idx, on) { const s = get().slotById(slotId); if (s) get().mutateChecks(w => setItemDone(w, s, idx, on), { removeLogged: true, label: exInfo(get().cfg, s.items[idx].ex).n }); },
  checkDay(day, on) {
    const slots = get().activeSlots();
    get().mutateChecks(w => currentLayout(w, slots)[day].forEach(s => { if (!isSkipped(s, w)) setCardDone(w, s, on); }), { removeLogged: true, label: `Day ${day}` });
  },
  skipCard(slotId) {
    const s = get().slotById(slotId); let skipped = false; let cleared: string[] = [];
    const ok = get().mutateChecks(w => {
      w.skipped = w.skipped || {};
      if (s && isSkipped(s, w)) { delete w.skipped[slotId]; if (isSkipped(s, w)) s.items.forEach((_, i) => delete w.skipped[itemKey2(s, i)]); } // back; if every exercise was skipped on its own, those go too
      else {
        w.skipped[slotId] = true; skipped = true; const had = Object.keys(w.done || {});
        if (s) clearForSkip(w, s); else delete w.done[slotId];
        cleared = had.filter(k => !(w.done || {})[k]);
      }
    });
    if (!ok) return;
    const label = s ? s.items.map(it => exInfo(get().cfg, it.ex).n).join(s.type === 'either' ? ' or ' : ' → ') : '';
    const keep = get().skipNote; // un-skipping a different card leaves this card's notice alone
    set({ skipNote: skipped ? { week: get().weekKey(), slotId, text: `Skipped${label ? ' ' + label : ''} for this week.`, done: cleared } : keep && keep.slotId !== slotId ? keep : null });
    if (!skipped) flag('Skip undone'); // skipping shows its own notice with Undo, so no second line saying the same
  },
  skipItem(slotId, idx) {
    const s = get().slotById(slotId); if (!s || !isPaired(s)) return;
    const key = itemKey2(s, idx); let skipped = false;
    let cleared: string[] = [];
    const ok = get().mutateChecks(w => { skipped = !(w.skipped || {})[key]; const had = Object.keys(w.done || {}); setItemSkipped(w, s, idx, skipped); cleared = had.filter(k => !(w.done || {})[k]); }, { removeLogged: true, label: exInfo(get().cfg, s.items[idx].ex).n });
    if (!ok) return;
    const name = exInfo(get().cfg, s.items[idx].ex).n;
    const keep = get().skipNote;
    set({ skipNote: skipped ? { week: get().weekKey(), slotId, key, text: `Skipped ${name} for this week.`, done: cleared } : keep && keep.key !== key ? keep : null });
    if (!skipped) flag('Skip undone');
  },
  // Un-skip the last skipped card and put back the ticks the skip cleared (and with them their check-off entries).
  undoSkip() {
    const n = get().skipNote; if (!n || n.week !== get().weekKey() || get().blocked()) return;
    set({ skipNote: null });
    const key = n.key ?? n.slotId;
    if (!(get().week.skipped || {})[key]) return; // already back
    if (get().mutateChecks(w => { delete w.skipped[key]; w.done = w.done || {}; n.done.forEach(k => { w.done[k] = true; }); })) flag('Skip undone');
  },
  dismissSkip: () => set({ skipNote: null }),
  // Yesterday's leftovers: skip or move a batch of cards at once.
  skipCards(ids) {
    const ok = get().mutateChecks(w => ids.forEach(id => { const s = get().slotById(id); w.skipped[id] = true; if (s) clearForSkip(w, s); }));
    if (ok) { set({ skipNote: null }); flag(`Skipped ${ids.length} for this week`); } // a batch skip replaces any single-card notice (its saved ticks would be stale)
  },
  moveCards(ids, day) {
    const week0 = get().week; const pd = dayAt(week0, day);
    if (pd == null) { flag('That is your rest day'); return; }
    const cards = ids.map(id => get().slotById(id)).filter((s): s is FlatSlot => !!s); if (!cards.length) return;
    const batch = Object.fromEntries(cards.map(s => [s.id, week0.moved[s.id] ?? null])); // what undo puts back
    if (!get().mutateWeek(w => cards.forEach(s => { if (pd === s.day) delete w.moved[s.id]; else w.moved[s.id] = pd; }))) return;
    set({ orderNote: null });
    const { cfg, week } = get(); const slots = get().activeSlots();
    const lines = [...new Set(cards.flatMap(s => moveClashes(cfg, week, slots, s, day)))];
    const fromShown = colOf(week0, week0.moved[cards[0].id] || cards[0].day);
    const warn = lines.length > 0 && injuryPreventionOn(cfg);
    set({ moveNote: warn ? { batch, fromShown, to: day, week: get().weekKey(), lines } : null });
    if (!warn) flag(`Moved ${cards.length} to Day ${day}`); // a heads-up is its own notice
  },
});
