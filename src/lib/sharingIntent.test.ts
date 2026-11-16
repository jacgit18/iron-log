import { afterEach, describe, expect, it } from 'vitest';
import { askSharing, clearSharingIntent, resumeModal, wantsSharing } from './sharingIntent.js';

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
