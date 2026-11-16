import { afterEach, describe, expect, it } from 'vitest';
import { READY_MS, askSharing, clearSharingIntent, readyResume, resumeModal, takeReadyResume, wantsSharing } from './sharingIntent.js';

afterEach(clearSharingIntent);

describe('sharing intent', () => {
  it('is empty until the receipt sheet asks', () => {
    expect(wantsSharing()).toBe(false);
    expect(resumeModal()).toBeNull();
  });
  it('hands the request and the receipt over, and reading twice gives the same answer', () => {
    const modal = { type: 'receipt', mk: '2026-11' };
    askSharing(modal);
    expect([wantsSharing(), wantsSharing()]).toEqual([true, true]);
    expect(resumeModal()).toBe(modal);
  });
  it('clearing forgets both', () => {
    askSharing({ type: 'receipt' });
    clearSharingIntent();
    expect(wantsSharing()).toBe(false);
    expect(resumeModal()).toBeNull();
  });
});

describe('ready resume', () => {
  it('is handed to the scan screen once', () => {
    const modal = { type: 'receipt' };
    readyResume(modal, 1000);
    expect(takeReadyResume(2000)).toBe(modal);
    expect(takeReadyResume(2000)).toBeNull();
  });
  it('expires, so an old receipt never comes back by surprise', () => {
    readyResume({ type: 'receipt' }, 1000);
    expect(takeReadyResume(1000 + READY_MS)).toBeNull();
  });
});
