import type { StoreApi } from 'zustand';
import { USAGE_EVENTS, USAGE_MAX_COUNT, type UsageCounts, type UsageEvent, type UsageReport } from '../shared/usage.js';
import type { AppState } from '../store/types.js';
import { inAndroidApp } from './androidApp.js';
import { LS } from './storage.js';

/* ---------- Opt-in anonymous usage counts (brief opt-in-usage-counts) ----------
   Off until the person turns the switch on in Settings. While it is off nothing here runs: no id is made, no count is kept, no request is
   sent. While it is on, six named events are counted on this phone, and the first time the app opens on a UTC day the counts go to
   POST /api/usage with a random id this phone made for itself (never an account, an email or anything the person logged). Turning the
   switch off forgets the id and the counts. A failed send keeps the counts for the next open and is never an error of its own. */

const ON = 'usage:on';
const ID = 'usage:id';
const COUNTS = 'usage:counts';
const SENT = 'usage:sent';

export const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The counts with one more of `event`, capped. */
export function addCount(counts: UsageCounts, event: UsageEvent, by = 1): UsageCounts {
  return { ...counts, [event]: Math.min((counts[event] ?? 0) + by, USAGE_MAX_COUNT) };
}

/** What storage holds, read defensively: only the six names, whole numbers from 1 to the cap. */
export function cleanCounts(raw: unknown): UsageCounts {
  const out: UsageCounts = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const name of USAGE_EVENTS) {
    const n = (raw as Record<string, unknown>)[name];
    if (typeof n === 'number' && Number.isInteger(n) && n > 0) out[name] = Math.min(n, USAGE_MAX_COUNT);
  }
  return out;
}

/** What is left after `sent` went out: counted while the request was in flight stays for the next send. */
export function subtractCounts(now: UsageCounts, sent: UsageCounts): UsageCounts {
  const out: UsageCounts = {};
  for (const name of USAGE_EVENTS) {
    const left = (now[name] ?? 0) - (sent[name] ?? 0);
    if (left > 0) out[name] = left;
  }
  return out;
}

export const usageDue = (sentDay: unknown, now: number) => sentDay !== utcDay(now);

export const buildReport = (id: string, version: string, fromApp: boolean, counts: UsageCounts): UsageReport => ({ id, version, fromApp, counts });

/** Which events a store change stands for. `prev` is the state before; nothing is counted until the store has loaded. */
export function eventsBetween(prev: Pick<AppState, 'exporting' | 'logs' | 'programs' | 'sync'>, cur: Pick<AppState, 'exporting' | 'logs' | 'programs' | 'sync'>): UsageEvent[] {
  const out: UsageEvent[] = [];
  if (cur.logs !== prev.logs && entryCount(cur.logs) > entryCount(prev.logs)) out.push('workout_logged');
  if (cur.programs !== prev.programs) out.push('program_edited');
  if (prev.sync === null && cur.sync !== null) out.push('sync_on');
  if (prev.exporting === null && cur.exporting !== null) out.push('export_used');
  return out;
}

const entryCount = (logs: AppState['logs']) => Object.values(logs).reduce((n, list) => n + list.length, 0);

export const usageOn = (): boolean => LS.get(ON) === true;

/** The switch. On makes a new random id and starts from zero; off forgets everything this phone kept. */
export function setUsage(on: boolean, makeId: () => string = () => crypto.randomUUID()): void {
  if (on) {
    LS.set(ID, makeId());
    LS.set(COUNTS, {});
    LS.remove(SENT);
    LS.set(ON, true);
  } else {
    for (const key of [ON, ID, COUNTS, SENT]) LS.remove(key);
  }
}

/** Counts one event. Does nothing while the switch is off. */
export function countUsage(event: UsageEvent): void {
  if (!usageOn()) return;
  LS.set(COUNTS, addCount(cleanCounts(LS.get(COUNTS)), event));
}

/** 'ok' stored, 'retry' try again at the next open (offline, busy, server not ready), 'drop' the server will never take it. */
export type SendResult = 'drop' | 'ok' | 'retry';
export type SendUsage = (report: UsageReport) => Promise<SendResult>;

export interface FlushDeps { send: SendUsage; version: string; fromApp: boolean; now: () => number }

/** Sends the counts once per UTC day, at the first open that finds them due. */
export async function flushUsage({ send, version, fromApp, now }: FlushDeps): Promise<void> {
  if (!usageOn() || !usageDue(LS.get(SENT), now())) return;
  const id = LS.get(ID);
  if (typeof id !== 'string') return;
  const counts = cleanCounts(LS.get(COUNTS));
  let result: SendResult;
  try { result = await send(buildReport(id, version, fromApp, counts)); } catch { result = 'retry'; }
  if (result === 'retry' || !usageOn() || LS.get(ID) !== id) return; // switched off (or off and on again) while the request was in flight
  LS.set(COUNTS, subtractCounts(cleanCounts(LS.get(COUNTS)), counts));
  LS.set(SENT, utcDay(now()));
}

/** The browser's way of sending one: same origin, fire and forget, never throws. */
export const sendUsage: SendUsage = async report => {
  try {
    const res = await fetch('/api/usage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report), keepalive: true });
    if (res.ok) return 'ok';
    return res.status === 422 ? 'drop' : 'retry';
  } catch { return 'retry'; }
};

/** Counts the open and watches the store for the other events; flushes when due. Returns the way to stop. */
export function startUsage(store: Pick<StoreApi<AppState>, 'getState' | 'subscribe'>, deps: FlushDeps = { send: sendUsage, version: __APP_VERSION__, fromApp: inAndroidApp(), now: Date.now }): () => void {
  countUsage('app_open');
  void flushUsage(deps);
  let last: Parameters<typeof eventsBetween>[0] | null = null;
  return store.subscribe(s => {
    if (!s.isReady()) return;
    if (last) for (const event of eventsBetween(last, s)) countUsage(event);
    last = { exporting: s.exporting, logs: s.logs, programs: s.programs, sync: s.sync };
  });
}
