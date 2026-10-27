import { LS } from './storage.js';

// One-time prompt, on any tab, that the app can be installed. Shown once the person is in (not while the sign-in card is up) on a device
// that can install and has not, until it is dismissed once; the dismissal is kept on this device only.
const KEY = 'hideinstall';
export interface HintInputs { installed: boolean; canPrompt: boolean; ios: boolean; signedOut: boolean; dismissed: boolean }

export const installHintDismissed = (): boolean => LS.get(KEY) === 1;
const dismissListeners = new Set<() => void>();
/** Hears the hint being dismissed, so another tip that waits for it can draw the moment it is gone. Returns the way to stop. */
export const onInstallHintDismissed = (fn: () => void): (() => void) => { dismissListeners.add(fn); return () => { dismissListeners.delete(fn); }; };
export const dismissInstallHint = () => { LS.set(KEY, 1); dismissListeners.forEach(fn => fn()); };

/** Pure rule: not installed, not dismissed, not waiting on sign-in, and the browser can install (a prompt event, or iPhone's Share menu). */
export function showInstallHint({ installed, canPrompt, ios, signedOut, dismissed }: HintInputs): boolean {
  return !installed && !dismissed && !signedOut && (canPrompt || ios);
}
