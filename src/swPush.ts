// What the service worker does with a Web Push message and a tap on its notification (ADR 044). Kept apart from sw.ts, which pulls in
// Workbox, so it can be tested with plain stand-ins for the worker's registration and clients.
export type PushKind = 'rest' | 'day-nudge' | 'water';
export interface PushMessage {
  kind: PushKind;
  key: string;
  at: number;
  body: string;
}

// The rest tag is the one the in-page "rest over" notice uses (lib/restNotify.ts), so a push and a local notice for the same timer replace each other.
export const TAGS: Record<PushKind, string> = { rest: 'rest-timer', 'day-nudge': 'day-nudge', water: 'water-reminder' };
// A tap opens on the board, except a water reminder, which opens Daily where the water log is.
const OPEN: Record<PushKind, string> = { rest: 'board', 'day-nudge': 'board', water: 'daily' };
const FALLBACK = 'Open Iron Log.';
// Its own tag: a message this worker cannot read (a kind a newer server added) must not replace, or close, a real rest or nudge notice.
const FALLBACK_TAG = 'iron-log';
const CLOSE_AFTER_MS = 3000;

/** The JSON the server sends (server/push/send.ts); anything else is null. */
export function parsePushMessage(text: string | null | undefined): PushMessage | null {
  if (!text) return null;
  try {
    const m = JSON.parse(text) as Partial<PushMessage> | null;
    if (m && (m.kind === 'rest' || m.kind === 'day-nudge' || m.kind === 'water') && typeof m.body === 'string' && m.body.length > 0 && m.body.length <= 140) {
      return { kind: m.kind, key: String(m.key ?? ''), at: Number(m.at) || 0, body: m.body };
    }
  } catch { /* not ours */ }
  return null;
}

interface WindowClientLike {
  visibilityState: string;
  focus(): Promise<unknown>;
}
export interface PushScope {
  registration: {
    scope: string;
    showNotification(title: string, options: NotificationOptions & { renotify?: boolean }): Promise<void>;
    getNotifications(filter: { tag: string }): Promise<{ close(): void }[]>;
  };
  clients: {
    matchAll(options: { type: 'window'; includeUncontrolled: boolean }): Promise<WindowClientLike[]>;
    openWindow(url: string): Promise<unknown>;
  };
}

/**
 * A push must always end in a notification: browsers (iPhone's Safari above all) revoke a site that receives pushes and shows nothing.
 * When the app is open in front, the page has already beeped and buzzed for its own timer, so the notice is shown without sound and
 * taken down again after a moment; with the app away it stays until tapped or replaced.
 */
export async function onPush(scope: PushScope, text: string | null | undefined, sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms))): Promise<void> {
  const message = parsePushMessage(text);
  const tag = message ? TAGS[message.kind] : FALLBACK_TAG;
  const visible = (await scope.clients.matchAll({ type: 'window', includeUncontrolled: true })).some(c => c.visibilityState === 'visible');
  await scope.registration.showNotification('Iron Log', {
    body: message?.body ?? FALLBACK,
    tag,
    renotify: true,
    silent: visible,
    icon: `${scope.registration.scope}icons/icon-192.png`,
    data: { url: `${scope.registration.scope}?open=${message ? OPEN[message.kind] : 'board'}` },
  });
  if (visible) {
    await sleep(CLOSE_AFTER_MS);
    (await scope.registration.getNotifications({ tag })).forEach(n => n.close());
  }
}

/** A tap brings an open window forward, or opens the app on the board (a water reminder: on Daily). */
export async function onNotificationClick(scope: PushScope, notification: { close(): void; data?: unknown }): Promise<void> {
  notification.close();
  const url = (notification.data as { url?: unknown } | null | undefined)?.url;
  const target = typeof url === 'string' && url.startsWith(scope.registration.scope) ? url : scope.registration.scope;
  const open = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const front = open.find(c => c.visibilityState === 'visible') ?? open[0];
  if (front) await front.focus();
  else await scope.clients.openWindow(target);
}
