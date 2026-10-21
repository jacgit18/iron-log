import { PUSH_KINDS, type PushKind } from './scheduler.ts';

// Reads the bodies of the push routes. Anything off returns null and the route answers 422; nothing is trimmed or guessed.
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

export const MAX_AHEAD_MS = 3 * 60 * 60_000;
export const MAX_BODY = 140;
export const MAX_SUBSCRIPTIONS = 10;

/* The push services a browser can hand out an endpoint on. The server POSTs to whatever endpoint is stored, so a subscription is accepted only on one of these
   (an endpoint on any other host would let a signed-in account make the server call an address of its choosing: an internal service, the cloud metadata server).
   Chrome, Edge, Brave, Opera and Samsung Internet use FCM; Firefox its own; Safari Apple's; Edge on Windows also WNS. */
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];

// The strict shape `https://<host>` as written: web-push connects with Node's legacy url.parse, which reads `https:host/x`, `https:///host/x` and `https://\host/x`
// as having no host (so the request goes to the default host), while the WHATWG parser below reads the same text as `host`. Only the plain form is accepted.
const PLAIN_HTTPS = /^https:\/\/[^\\/?#@\s]+(?:[/?#]|$)/i;

/** Whether the URL is https on a push service's own host: written as `https://host`, no user or password, no port but 443, no IP address. */
export function isPushServiceUrl(s: string): boolean {
  if (!PLAIN_HTTPS.test(s) || /[\u0000-\u0020\u007f]/.test(s)) return false; // plain form only, and no space or control character anywhere (the WHATWG parser drops tabs and newlines silently)
  let u: URL;
  try { u = new URL(s); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
  const host = u.hostname.toLowerCase();
  return PUSH_HOSTS.some(h => host === h || host.endsWith(`.${h}`));
}

/** The endpoint as the browser reports it: https on a known push service, and short enough for the table's check. */
export function parseEndpoint(v: unknown): string | null {
  const s = str(v, 2048);
  return s && isPushServiceUrl(s) ? s : null;
}

/** A browser's PushSubscription.toJSON(): { endpoint, keys: { p256dh, auth } }. */
export function parseSubscription(body: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  const b = obj(body);
  const keys = obj(b?.keys);
  const endpoint = parseEndpoint(b?.endpoint);
  const p256dh = str(keys?.p256dh, 256);
  const auth = str(keys?.auth, 256);
  return endpoint && p256dh && auth ? { endpoint, p256dh, auth } : null;
}

export function parseUnsubscribe(body: unknown): { endpoint: string } | null {
  const endpoint = parseEndpoint(obj(body)?.endpoint);
  return endpoint ? { endpoint } : null;
}

const isKind = (v: unknown): v is PushKind => PUSH_KINDS.includes(v as PushKind);
// The key becomes part of a task name, which allows letters, digits, hyphen and underscore only.
const keyOf = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : null);

export function parseSchedule(body: unknown, now: number): { endpoint: string; kind: PushKind; key: string; at: number; text: string } | null {
  const b = obj(body);
  const endpoint = parseEndpoint(b?.endpoint);
  const key = keyOf(b?.key);
  const text = str(b?.body, MAX_BODY);
  const at = b?.at;
  // eslint-disable-next-line no-control-regex
  if (!endpoint || !key || !text || /[\u0000-\u001f]/.test(text) || !isKind(b?.kind)) return null;
  if (typeof at !== 'number' || !Number.isFinite(at) || at < now - 5_000 || at > now + MAX_AHEAD_MS) return null;
  return { endpoint, kind: b.kind, key, at: Math.round(at), text };
}

export function parseCancel(body: unknown): { endpoint: string; kind: PushKind; key?: string } | null {
  const b = obj(body);
  const endpoint = parseEndpoint(b?.endpoint);
  if (!endpoint || !isKind(b?.kind)) return null;
  if (b.key === undefined) return { endpoint, kind: b.kind };
  const key = keyOf(b.key);
  return key ? { endpoint, kind: b.kind, key } : null;
}

/** What a Cloud Tasks task carries to /api/push/fire (see cloudTasks.ts). */
export function parseFire(body: unknown): { subscriptionId: string; kind: PushKind; key: string; at: number; text: string } | null {
  const b = obj(body);
  const subscriptionId = typeof b?.subscriptionId === 'string' && /^[0-9]{1,18}$/.test(b.subscriptionId) ? b.subscriptionId : null;
  const key = keyOf(b?.key);
  const text = str(b?.body, MAX_BODY);
  if (!subscriptionId || !key || !text || !isKind(b?.kind) || typeof b?.at !== 'number' || !Number.isSafeInteger(b.at)) return null;
  return { subscriptionId, kind: b.kind, key, at: b.at, text };
}
