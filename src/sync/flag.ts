/* ---------- The sync feature flag (a release flag, see feature-flags.md) ----------
   Off unless turned on, so the app keeps using the browser's own storage until syncing is trusted. Two ways to turn it on:
     build time:  VITE_API_SYNC=true            (a build that has it on for everyone)
     one browser: localStorage ironlog:flag:apiSync = true   (to try it on one device, on or off without a rebuild) */

export const FLAG_KEY = 'flag:apiSync';

/** `stored` is what the browser's storage holds for FLAG_KEY (LS.get), `built` the build-time value. */
export function apiSyncEnabled(stored: unknown, built: string | undefined): boolean {
  if (stored === true || stored === 'true') return true;
  if (stored === false || stored === 'false') return false; // an explicit "off" in this browser beats the build
  return built === 'true';
}
