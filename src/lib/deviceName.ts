/* ---------- A name for this device, for backups ----------
   The account backup of a day says which device wrote it (brief backup-device-names). The name comes from the browser (iPhone, Mac, Windows PC...)
   unless the person renamed the device, which is kept in this browser. Nothing here throws. */
import { LS } from './storage.js';

const KEY = 'devicename';
export const DEVICE_NAME_MAX = 40;

type Nav = { userAgent?: string; platform?: string; maxTouchPoints?: number };

/** What the browser says this device is. An iPad that asks for the desktop site says Mac, told apart by its touch screen. */
export function autoDeviceName(nav: Nav = typeof navigator === 'undefined' ? {} : navigator): string {
  const ua = nav.userAgent ?? '';
  if (/iPhone|iPod/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1)) return 'iPad';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (/CrOS/.test(ua)) return 'Chromebook';
  if (/Linux|X11/.test(ua)) return 'Linux PC';
  return 'This browser';
}

/** A name worth keeping: trimmed, 1 to 40 printable characters, else null. */
export function cleanDeviceName(text: string): string | null {
  const t = text.trim();
  // oxlint-disable-next-line no-control-regex
  return t.length >= 1 && t.length <= DEVICE_NAME_MAX && !/[\x00-\x1f\x7f]/.test(t) ? t : null;
}

/** The name this device uses: the one the person gave it, else the browser's. */
export function deviceName(): string {
  const own = LS.get(KEY);
  return typeof own === 'string' && cleanDeviceName(own) ? cleanDeviceName(own)! : autoDeviceName();
}
/** Gives this device a name (an empty text goes back to the browser's). False when the text is not a usable name or the browser would not save it. */
export function renameDevice(text: string): boolean {
  if (!text.trim()) { LS.remove(KEY); return true; }
  const name = cleanDeviceName(text);
  return name !== null && LS.set(KEY, name);
}
