// Signing out or wiping the device forgets a receipt left open (brief receipt-back-guard): every sign-out, wipe and Delete my data goes through forgetBackups.
import { beforeAll, expect, it, vi } from 'vitest';
import '../test/browserStubs.js';
import { forgetSession } from '../lib/gate.js';
import { DRAFT_KEY, keepDraft, readDraft } from '../lib/receiptDraft.js';

let useAppStore: any;
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); });

it('forgetBackups erases the receipt draft', async () => {
  const m = new Map<string, string>();
  vi.stubGlobal('sessionStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } });
  keepDraft({ savedAt: Date.now(), mk: '2026-11', receipt: { lines: [{ text: 'BANANAS', qty: 1, grossCents: 149, discountCents: 0, matchId: null }] }, restore: null });
  expect(m.has(DRAFT_KEY)).toBe(true);
  expect(readDraft(Date.now())).not.toBeNull();
  await useAppStore.getState().forgetBackups();
  expect(m.has(DRAFT_KEY)).toBe(false);
  vi.unstubAllGlobals();
});

it('forgetSession (every sign-out, Delete my data and the dev sign-out) erases it too', () => {
  const m = new Map<string, string>();
  vi.stubGlobal('sessionStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } });
  keepDraft({ savedAt: Date.now(), mk: '2026-11', receipt: { lines: [{ text: 'BANANAS', qty: 1, grossCents: 149, discountCents: 0, matchId: null }] }, restore: null });
  forgetSession({ remove: () => undefined });
  expect(m.has(DRAFT_KEY)).toBe(false);
  vi.unstubAllGlobals();
});
