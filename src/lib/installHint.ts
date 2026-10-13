import { LS } from './storage.js';

// One-time hint on the board that the app can be installed (released to everyone, see FEATURES.installHint). Shown on a phone that can
// install and has not, until it is dismissed once; the dismissal is kept on this device only.
const KEY = 'hideinstall';
export interface HintInputs { installed: boolean; canPrompt: boolean; ios: boolean; phone: boolean; dismissed: boolean }

export const installHintDismissed = (): boolean => LS.get(KEY) === 1;
export const dismissInstallHint = () => { LS.set(KEY, 1); };

/** Pure rule: not installed, a touch phone, not dismissed, and the browser can install (a prompt event, or iPhone's Share menu). */
export function showInstallHint({ installed, canPrompt, ios, phone, dismissed }: HintInputs): boolean {
  return !installed && !dismissed && phone && (canPrompt || ios);
}
