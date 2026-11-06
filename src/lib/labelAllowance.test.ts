import { beforeEach, describe, expect, it } from 'vitest';
import { currentAllowance, LABEL_USED_UP_TEXT, labelCostText, labelUsedUp, markUsedUp, rememberAllowance, resetAllowance, USED_UP_MAX_MS } from './labelAllowance.js';

// The count under Photo the label (brief barcode-miss-ladder). The cap is shared by the whole server, so the sheet shows a number only once an answer carried it.
beforeEach(resetAllowance);

describe('labelCostText', () => {
  it('says only "Uses AI" until a count is known, then how many are left', () => {
    expect(labelCostText(currentAllowance())).toBe('Uses AI');
    rememberAllowance({ left: 12, max: 30 });
    expect(labelCostText(currentAllowance())).toBe('Uses AI · 12 of 30 left today');
  });
});

describe('rememberAllowance', () => {
  it('ignores a count that is missing, not whole or out of range', () => {
    for (const bad of [null, {}, { left: '3', max: 30 }, { left: 3.5, max: 30 }, { left: -1, max: 30 }, { left: 31, max: 30 }, { left: 0, max: 0 }]) rememberAllowance(bad);
    expect(currentAllowance()).toBeNull();
  });
  it('keeps the newest good count', () => {
    rememberAllowance({ left: 5, max: 30 }); rememberAllowance({ left: 4, max: 30 });
    expect(currentAllowance()).toEqual({ left: 4, max: 30 });
  });
});

describe('the used-up hold', () => {
  it('lasts until the server\'s retry time (at most ten minutes), then the button comes back and the count is unknown', () => {
    markUsedUp(120, 1_000);
    expect(currentAllowance(1_000 + 119_000)?.left).toBe(0);
    expect(currentAllowance(1_000 + 120_000)).toBeNull();
    markUsedUp(86_000, 0);
    expect(currentAllowance(USED_UP_MAX_MS - 1)?.left).toBe(0);
    expect(currentAllowance(USED_UP_MAX_MS)).toBeNull();
  });
  it('holds a none-left count from an answer for ten minutes too, and a non-zero count never expires', () => {
    rememberAllowance({ left: 0, max: 30 }, 0);
    expect(currentAllowance(USED_UP_MAX_MS - 1)?.left).toBe(0);
    expect(currentAllowance(USED_UP_MAX_MS)).toBeNull();
    rememberAllowance({ left: 3, max: 30 }, 0);
    expect(currentAllowance(10 * USED_UP_MAX_MS)).toEqual({ left: 3, max: 30 });
  });
});

describe('the used-up state', () => {
  it('is on when none are left or the cap said no, and gives the reason', () => {
    expect(labelUsedUp(null)).toBe(false);
    rememberAllowance({ left: 0, max: 30 });
    expect(labelUsedUp(currentAllowance())).toBe(true);
    resetAllowance(); markUsedUp();
    expect(labelUsedUp(currentAllowance())).toBe(true);
    expect(LABEL_USED_UP_TEXT).toContain('Type the name');
  });
});
