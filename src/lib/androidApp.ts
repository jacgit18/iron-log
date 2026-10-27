// Whether this page was opened from the Android app. The Google Play build is a Trusted Web Activity around this site: Chrome opens it with
// the referrer android-app://<package>. That build shows no prices and no way to buy (ADR 065 point 8, the Plans page in ADR 078), so pages that show plans check this.
// The referrer is only set on the first load, so it is remembered for the rest of the session in sessionStorage: it belongs to that one
// window, so a normal Chrome tab on the same phone (same site storage, different session) is not mistaken for the app.
const KEY = 'fromAndroidApp';
const PREFIX = 'android-app://';

export function inAndroidApp(referrer?: string, store?: Pick<Storage, 'getItem' | 'setItem'>): boolean {
  let from = '';
  try {
    from = referrer ?? document.referrer;
    const mem = store ?? sessionStorage;
    if (from.startsWith(PREFIX)) { mem.setItem(KEY, '1'); return true; }
    return mem.getItem(KEY) === '1';
  } catch {
    return from.startsWith(PREFIX); // storage blocked: the referrer alone still answers for the first load
  }
}
