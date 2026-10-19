import { signIn } from '../sync/devUser.js';
import { LS } from './storage.js';

// The phone's side of Web Push (ADR 044): subscribe this browser, and ask the server to push a timer end or a "day not finished" nudge
// later, so it reaches a phone that has locked. Released to everyone signed in (was admin-only). Device-local opt-in, like lib/restNotify.ts;
// every failure is quiet, because the page's own beep and the local notice are the fallback.
export type PushKind = 'rest' | 'day-nudge';

const ON = 'webPush';
const KIND_KEY: Record<PushKind, string> = { rest: 'pushRest', 'day-nudge': 'pushNudge' };

export const pushSupported = (): boolean =>
  typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
/** This device turned push on and the browser still allows it. */
export const pushOn = (): boolean => pushSupported() && LS.get(ON) === true && Notification.permission === 'granted';
/** A kind is wanted unless its box was unticked; the master switch comes first. */
export const pushKindOn = (kind: PushKind): boolean => pushOn() && pushKindWanted(kind);
/** The box for a kind, apart from the master switch: ticked unless it was unticked. */
export const pushKindWanted = (kind: PushKind): boolean => LS.get(KIND_KEY[kind]) !== false;
/** Ticks or unticks a kind's box. Unticking also takes back an ask already with the server, which would otherwise still arrive. */
export const setPushKind = (kind: PushKind, on: boolean) => { LS.set(KIND_KEY[kind], on); if (!on) cancelPush(kind); };

const headers = () => ({ 'content-type': 'application/json', 'x-client-version': __APP_VERSION__, ...signIn() });
async function api(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Response | null> {
  try {
    return await fetch(`/api/push${path}`, { method, headers: headers(), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch { return null; }
}

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const raw = atob(base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Url.length / 4) * 4, '='));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
  try { return await (await navigator.serviceWorker.ready).pushManager.getSubscription(); } catch { return null; }
}

async function subscribeBrowser(): Promise<PushSubscription | 'unavailable'> {
  const res = await api('GET', '/key');
  const body = res?.ok ? ((await res.json().catch(() => null)) as { publicKey?: unknown } | null) : null;
  if (typeof body?.publicKey !== 'string') return 'unavailable'; // signed out, or the server has no keys
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(body.publicKey) });
}

const registered = async (sub: PushSubscription) => (await api('POST', '/subscribe', sub.toJSON()))?.ok === true;

/** Turns push on for this device (call it from a click: it asks for permission). Says where it ended up. */
export async function enablePush(): Promise<'on' | 'denied' | 'unsupported' | 'unavailable' | 'failed'> {
  if (!pushSupported()) return 'unsupported';
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  try {
    const existing = await currentSubscription();
    const sub = existing ?? await subscribeBrowser();
    if (sub === 'unavailable') return 'unavailable';
    if (!(await registered(sub))) { if (!existing) await sub.unsubscribe().catch(() => false); return 'failed'; }
    LS.set(ON, true);
    return 'on';
  } catch { return 'failed'; }
}

/** Turns push off: the server forgets this device, and so does the browser. Also used when signing out, so a shared phone is not left subscribed. */
export async function disablePush(): Promise<void> {
  const was = LS.get(ON) === true;
  LS.set(ON, false);
  if (!was || !pushSupported()) return;
  const sub = await currentSubscription();
  if (!sub) return;
  await api('POST', '/unsubscribe', { endpoint: sub.endpoint });
  await sub.unsubscribe().catch(() => false);
}

/** On app start: a browser can drop or rotate a subscription, so make sure there is one and the server has its current keys. */
export async function renewPush(): Promise<void> {
  if (!pushOn()) return;
  try {
    const sub = (await currentSubscription()) ?? await subscribeBrowser();
    if (sub !== 'unavailable') await registered(sub);
  } catch { /* try again next start */ }
}

// Asks run one after another, so a cancel never overtakes the schedule it follows.
let chain: Promise<unknown> = Promise.resolve();
const covered = new Set<string>();
const coverKey = (kind: PushKind, key: string) => `${kind}:${key}`;

/** True when the server accepted the push for this kind and key (so the local notice would be a second one). */
export const pushCovers = (kind: PushKind, key: string): boolean => covered.has(coverKey(kind, key));

/** Asks for a push at `at` (ms). A newer ask of the same kind replaces it. */
export function schedulePush(kind: PushKind, key: string, at: number, body: string): void {
  if (!pushKindOn(kind) || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  chain = chain.then(async () => {
    try {
      const sub = await currentSubscription();
      if (!sub) return;
      const res = await api('POST', '/schedule', { endpoint: sub.endpoint, kind, key, at, body: body.slice(0, 140) });
      if (res?.ok) covered.add(coverKey(kind, key));
    } catch { /* the page's own alerts remain */ }
  });
}

/** Takes the ask back. With a key, only that ask (so a late cancel of an old timer cannot undo a newer one). */
export function cancelPush(kind: PushKind, key?: string): void {
  // Not gated on the kind's box: unticking the box has to be able to take back what was already asked for.
  if (!pushOn() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  if (key) covered.delete(coverKey(kind, key));
  chain = chain.then(async () => {
    if (key) covered.delete(coverKey(kind, key)); // again: the schedule ahead of this in the line may have just added it
    try {
      const sub = await currentSubscription();
      if (sub) await api('POST', '/cancel', { endpoint: sub.endpoint, kind, ...(key ? { key } : {}) });
    } catch { /* it will simply fire and be dropped */ }
  });
}
