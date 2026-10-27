import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ALL_TEXT, dismissProgramCard, MONEY_WORDS, programCardDismissed, sendLink, sharePayload, showProgramCard, showProgramRow, type CardInputs } from './programOnComputer.js';

const base: CardInputs = { touch: true, programTab: true, waitingForSignIn: false, installHintShowing: false, dismissed: false };

describe('showProgramCard', () => {
  it('shows on a touch screen, on the Program tab', () => expect(showProgramCard(base)).toBe(true));
  it.each([
    ['a computer (no touch)', { touch: false }],
    ['another tab', { programTab: false }],
    ['sign-in or the data is still pending', { waitingForSignIn: true }],
    ['the install hint is showing', { installHintShowing: true }],
    ['it was dismissed', { dismissed: true }],
  ] as [string, Partial<CardInputs>][])('is hidden for %s', (_, over) => expect(showProgramCard({ ...base, ...over })).toBe(false));
});

describe('showProgramRow', () => {
  it('is on for touch screens, off for a computer', () => { expect(showProgramRow(true)).toBe(true); expect(showProgramRow(false)).toBe(false); });
});

describe('dismissal', () => {
  const store: Record<string, string> = {};
  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } });
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  it('is remembered on this device', () => {
    expect(programCardDismissed()).toBe(false);
    dismissProgramCard();
    expect(programCardDismissed()).toBe(true);
  });
});

describe('sharePayload', () => {
  it('shares this site address, so staging shares staging', () => {
    expect(sharePayload('https://loadbearer.app').url).toBe('https://loadbearer.app/');
    expect(sharePayload('https://staging.loadbearer.app').url).toBe('https://staging.loadbearer.app/');
  });
});

describe('sendLink', () => {
  const abort = () => Object.assign(new Error('closed'), { name: 'AbortError' });
  it('opens the share sheet with the address', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    expect(await sendLink('https://loadbearer.app', { share })).toBe('shared');
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://loadbearer.app/' }));
  });
  it('treats closing the sheet as nothing, without copying', async () => {
    const writeText = vi.fn();
    expect(await sendLink('https://loadbearer.app', { share: () => Promise.reject(abort()), writeText })).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });
  it('copies the address when there is no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await sendLink('https://loadbearer.app', { writeText })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://loadbearer.app/');
  });
  it('copies when the share sheet fails for another reason', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await sendLink('https://loadbearer.app', { share: () => Promise.reject(new Error('boom')), writeText })).toBe('copied');
  });
  it('fails quietly when nothing can share or copy', async () => {
    expect(await sendLink('https://loadbearer.app', {})).toBe('failed');
    expect(await sendLink('https://loadbearer.app', { writeText: () => Promise.reject(new Error('blocked')) })).toBe('failed');
  });
});

describe('wording', () => {
  it.each(ALL_TEXT)('has no price, plan or subscribe word: %s', text => expect(MONEY_WORDS.test(text)).toBe(false));
  it('the check itself catches money talk', () => {
    for (const bad of ['See our plans', 'Subscribe now', 'Only $5.99', 'Upgrade to Plus', 'Free for now']) expect(MONEY_WORDS.test(bad)).toBe(true);
  });
});
