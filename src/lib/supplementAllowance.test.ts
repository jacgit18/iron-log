import { beforeEach, describe, expect, it } from 'vitest';
import { currentSupplementAllowance, markSupplementUsedUp, rememberSupplementAllowance, resetSupplementAllowance, SUPPLEMENT_USED_UP_MAX_MS, SUPPLEMENT_USED_UP_TEXT, supplementCostText, supplementUsedUp } from './supplementAllowance.js';

// The count under Scan the bottle's label (brief supplement-label-scan): 5 a person a day, kept apart from the label count.
beforeEach(resetSupplementAllowance);

describe('supplementCostText', () => {
  it('says only "Uses AI" until a count is known, then how many are left', () => {
    expect(supplementCostText(currentSupplementAllowance())).toBe('Uses AI');
    rememberSupplementAllowance({ left: 4, max: 5 });
    expect(supplementCostText(currentSupplementAllowance())).toBe('Uses AI · 4 of 5 left today');
  });
});

describe('rememberSupplementAllowance', () => {
  it('ignores a count that is missing, not whole or out of range', () => {
    for (const bad of [null, {}, { left: '3', max: 5 }, { left: 3.5, max: 5 }, { left: -1, max: 5 }, { left: 6, max: 5 }, { left: 0, max: 0 }]) rememberSupplementAllowance(bad);
    expect(currentSupplementAllowance()).toBeNull();
  });
});

describe('the used-up hold', () => {
  it('disables the button at 0, lasts until the server\'s retry time (at most ten minutes), then the count is unknown', () => {
    markSupplementUsedUp(120, 1_000);
    expect(supplementUsedUp(currentSupplementAllowance(1_000))).toBe(true);
    expect(currentSupplementAllowance(1_000 + 119_000)?.left).toBe(0);
    expect(currentSupplementAllowance(1_000 + 120_000)).toBeNull();
    markSupplementUsedUp(86_400, 0);
    expect(currentSupplementAllowance(SUPPLEMENT_USED_UP_MAX_MS - 1)?.left).toBe(0);
    expect(currentSupplementAllowance(SUPPLEMENT_USED_UP_MAX_MS)).toBeNull();
  });
  it('says what to do instead', () => { expect(SUPPLEMENT_USED_UP_TEXT).toBe('Bottle scans are used up for today. Type the amounts instead.'); });
});
