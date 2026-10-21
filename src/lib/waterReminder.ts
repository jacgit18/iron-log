import { ymd } from '../shared/dates.js';
import { cancelPush, pushKindOn, schedulePush } from './pushClient.js';
import { LS } from './storage.js';
import { goalFor, sumOz } from './water.js';
import type { Supplements } from '../types.js';

// The drink-water reminder (ADR 044): while this device wants it, the phone asks the server for the next reminder and the server queues each one after
// that until the window ends (server/push/fire.ts). The phone decides the rest: it re-arms from now at every drink (so a reminder never lands just after
// one), cancels when today's goal is met, and keeps an armed chain alone when the app is only opened. Settings are device-local, like the other push boxes.
export const WATER_BODY = 'Time for a glass of water.';
export const WATER_DEFAULTS = { everyH: 2, from: '08:00', until: '21:30' } as const;
const MAX_AHEAD_MS = 3 * 3_600_000; // the server takes a push at most this far ahead

export interface WaterPrefs { everyH: number; from: string; until: string }
const EVERY = 'waterEvery', FROM = 'waterFrom', UNTIL = 'waterUntil', ARMED = 'waterArmed'; // the same key pushClient forgets when the server stops holding the chain

export const validTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export function waterPrefs(): WaterPrefs {
  const e = LS.get(EVERY), f = LS.get(FROM), u = LS.get(UNTIL);
  return { everyH: e === 1 || e === 2 || e === 3 ? e : WATER_DEFAULTS.everyH, from: validTime(f) ? f : WATER_DEFAULTS.from, until: validTime(u) ? u : WATER_DEFAULTS.until };
}
/** Saves what is valid, drops the armed chain (it was planned with the old settings) and plans again. */
export function setWaterPrefs(patch: Partial<WaterPrefs>, goalMet: boolean, now = Date.now()): void {
  if (patch.everyH === 1 || patch.everyH === 2 || patch.everyH === 3) LS.set(EVERY, patch.everyH);
  if (validTime(patch.from)) LS.set(FROM, patch.from);
  if (validTime(patch.until)) LS.set(UNTIL, patch.until);
  LS.remove(ARMED);
  trackWater('change', goalMet, now);
}

export interface WaterPlan { at: number; until: number }

/**
 * When the next reminder should come, or null for none: not once the goal is met, not before the window opens (it waits for it), and not past the window's
 * end or further ahead than the server takes. `now` plus the interval, because the reminder after a drink counts from the drink.
 */
export function planWater(now: number, prefs: WaterPrefs, goalMet: boolean): WaterPlan | null {
  if (goalMet) return null;
  const edge = (hhmm: string) => { const d = new Date(now); d.setHours(Number(hhmm.slice(0, 2)), Number(hhmm.slice(3)), 0, 0); return d.getTime(); }; // by the clock, so a daylight saving day keeps the right hour
  const from = edge(prefs.from), until = edge(prefs.until);
  if (until <= from) return null;
  const at = Math.max(now + prefs.everyH * 3_600_000, from);
  if (at > until || at - now > MAX_AHEAD_MS) return null;
  return { at, until };
}

/** Whether today's water has reached today's goal. */
export function goalMetNow(supp: Supplements, body: { d: string; w: number }[], now = Date.now()): boolean {
  const date = ymd(new Date(now));
  const oz = sumOz(supp.water[date]);
  return oz > 0 && oz >= goalFor(supp, body, date).oz;
}

const armed = (): WaterPlan | null => {
  const a = LS.get(ARMED);
  return a && Number.isFinite(a.at) && Number.isFinite(a.until) ? a : null;
};

/** Takes back an armed chain. Nothing armed, nothing to take back: no request, so opening the app after the goal is met or the window has closed costs nothing. */
function stop() { if (!armed()) return; LS.remove(ARMED); cancelPush('water'); }

/**
 * Keeps the reminder in step with what happened. 'drink': a drink was logged now, so ask for the next one an interval from now (or stop, if that is past
 * the window). 'open' and 'change' (app opened or resumed, a drink taken back, the goal changed): plan one only when none is armed for a window that
 * has not ended, so opening the app never pushes a coming reminder further away.
 */
export function trackWater(why: 'open' | 'drink' | 'change', goalMet: boolean, now = Date.now()): void {
  if (!pushKindOn('water')) return;
  if (goalMet) return stop();
  const current = armed();
  if (why !== 'drink' && current && current.until > now) return;
  const prefs = waterPrefs();
  const plan = planWater(now, prefs, goalMet);
  if (!plan) return stop();
  LS.set(ARMED, plan);
  // A refused or unsent ask leaves the server holding whatever was armed before, so the note goes back to that, not to nothing.
  void schedulePush('water', `w${plan.at}`, plan.at, WATER_BODY, { everyMs: prefs.everyH * 3_600_000, until: plan.until }).then(ok => {
    if (ok || armed()?.at !== plan.at) return;
    if (current) LS.set(ARMED, current); else LS.remove(ARMED);
  });
}
