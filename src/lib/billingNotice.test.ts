import { describe, expect, it } from 'vitest';
import { BILLING_NOTICE_TEXT, dismissBillingNotice, isBillingNoticeDismissed, type NoticeStore } from './billingNotice.js';

const memory = (): NoticeStore & { data: Map<string, unknown> } => {
  const data = new Map<string, unknown>();
  return { data, get: k => data.get(k) ?? null, set: (k, v) => { data.set(k, v); return true; } };
};
const blocked = (): NoticeStore => ({ get: () => null, set: () => false });

describe('the one-time billing notice', () => {
  it('is gone for good once dismissed in this browser', () => {
    const store = memory();
    expect(isBillingNoticeDismissed(store)).toBe(false);
    dismissBillingNotice(store);
    expect(isBillingNoticeDismissed(store)).toBe(true);
    expect([...store.data.values()]).toEqual([true]);
  });

  it('shows again on each visit when the browser blocks storage, and does not throw on Dismiss', () => {
    const store = blocked();
    expect(() => dismissBillingNotice(store)).not.toThrow();
    expect(isBillingNoticeDismissed(store)).toBe(false);
  });

  it('ignores a stored value that is not exactly true (a damaged or old entry)', () => {
    for (const v of [false, 0, 1, 'true', {}, []]) {
      const store = memory();
      store.set('billingNotice', v);
      expect(isBillingNoticeDismissed(store), JSON.stringify(v)).toBe(false);
    }
  });

  it('says what the Terms and Privacy pages promise: paid plans exist, the app stays free, the paid benefit, and that nothing changes unless you subscribe', () => {
    expect(BILLING_NOTICE_TEXT).toMatch(/Paid plans are here/);
    expect(BILLING_NOTICE_TEXT).toMatch(/stays free/);
    expect(BILLING_NOTICE_TEXT).toMatch(/30-day backups/);
    expect(BILLING_NOTICE_TEXT).toMatch(/Nothing changes unless you subscribe/);
    expect(BILLING_NOTICE_TEXT).not.toMatch(/Iron Log/);
  });
});
