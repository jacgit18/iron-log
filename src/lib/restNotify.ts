import { LS } from './storage.js';

// "Rest over" notification for a timer that ends while the app is in the background. A device-local opt-in (the browser
// also has to grant permission), so nothing is asked until the person turns it on in Settings. It is a local notification:
// it shows only while the page can still run. A phone that has frozen the app shows nothing until the app is opened again.
const KEY = 'restNotify';
const TAG = 'rest-timer';

export const notifySupported = (): boolean => typeof Notification !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
export const restNotifyOn = (): boolean => notifySupported() && LS.get(KEY) === true && Notification.permission === 'granted';

/** Turns the alert on (asking the browser for permission, so call it from a click) or off. Says where it ended up. */
export async function setRestNotify(want: boolean): Promise<'on' | 'off' | 'denied' | 'unsupported'> {
  if (!want) { LS.set(KEY, false); return 'off'; }
  if (!notifySupported()) return 'unsupported';
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') { LS.set(KEY, false); return 'denied'; }
  LS.set(KEY, true);
  return 'on';
}

type Options = NotificationOptions & { renotify?: boolean };

// Android Chrome only allows notifications made through the service worker, so use it when there is one.
export async function showRestNotice(body: string): Promise<void> {
  try {
    const opts: Options = { body, tag: TAG, renotify: true, icon: `${import.meta.env.BASE_URL}icons/icon-192.png` };
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.showNotification('Iron Log', opts); else new Notification('Iron Log', opts);
  } catch { /* the browser refused: the beep and buzz are the fallback */ }
}

/** Takes the notice down once the app is in front again. */
export async function clearRestNotice(): Promise<void> {
  try {
    if (!notifySupported()) return;
    const reg = await navigator.serviceWorker.getRegistration();
    (await reg?.getNotifications({ tag: TAG }))?.forEach(n => n.close());
  } catch { /* nothing to clear */ }
}
