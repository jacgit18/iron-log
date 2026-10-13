import { describe, it, expect, beforeEach } from 'vitest';
import { showInstallHint, type HintInputs, installHintDismissed, dismissInstallHint } from './installHint.js';

const base: HintInputs = { installed: false, canPrompt: true, ios: false, phone: true, dismissed: false };

describe('showInstallHint', () => {
  it('shows on a phone that can install', () => expect(showInstallHint(base)).toBe(true));
  it('shows on an iPhone, which installs from the Share menu', () => expect(showInstallHint({ ...base, canPrompt: false, ios: true })).toBe(true));
  it.each([
    ['already installed', { installed: true }],
    ['dismissed before', { dismissed: true }],
    ['not a phone', { phone: false }],
    ['the browser cannot install', { canPrompt: false }],
  ] as [string, Partial<HintInputs>][])('is hidden when %s', (_, over) => expect(showInstallHint({ ...base, ...over })).toBe(false));
});

describe('dismissal', () => {
  const store: Record<string, string> = {};
  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k]);
    (globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
  });
  it('is remembered on this device', () => {
    expect(installHintDismissed()).toBe(false);
    dismissInstallHint();
    expect(installHintDismissed()).toBe(true);
  });
});
