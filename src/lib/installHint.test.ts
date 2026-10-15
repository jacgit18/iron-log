import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { showInstallHint, type HintInputs, installHintDismissed, dismissInstallHint } from './installHint.js';

const base: HintInputs = { installed: false, canPrompt: true, ios: false, signedOut: false, dismissed: false };

describe('showInstallHint', () => {
  it('shows on a device that can install', () => expect(showInstallHint(base)).toBe(true));
  it('shows on an iPhone, which installs from the Share menu', () => expect(showInstallHint({ ...base, canPrompt: false, ios: true })).toBe(true));
  it.each([
    ['already installed', { installed: true }],
    ['dismissed before', { dismissed: true }],
    ['sign-in is still pending', { signedOut: true }],
    ['the browser cannot install', { canPrompt: false }],
  ] as [string, Partial<HintInputs>][])('is hidden when %s', (_, over) => expect(showInstallHint({ ...base, ...over })).toBe(false));
});

describe('dismissal', () => {
  const store: Record<string, string> = {};
  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } });
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  it('is remembered on this device', () => {
    expect(installHintDismissed()).toBe(false);
    dismissInstallHint();
    expect(installHintDismissed()).toBe(true);
  });
});
