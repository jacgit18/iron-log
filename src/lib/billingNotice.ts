import { LS } from './storage.js';

/* ---------- The one-time "paid plans are here" notice (brief billing-go-live, ADR 065) ----------
   Privacy section 14 and Terms section 2 promise that paid plans are announced in the app. BillingPanel draws the notice only for a signed-in
   person whose server has billing on (so it never announces something that is not there); here it is shown once per browser and stays gone after Dismiss. "Once" is this browser
   only (localStorage): a new device shows it once more, and a browser that blocks storage shows it on each visit rather than failing. */
const KEY = 'billingNotice'; // LS adds the ironlog: prefix

/** The storage the notice needs; LS in the app, a stand-in in tests. */
export interface NoticeStore {
  get(k: string): unknown;
  set(k: string, v: unknown): boolean;
}

export const isBillingNoticeDismissed = (store: NoticeStore = LS): boolean => store.get(KEY) === true;

/** Remembers the Dismiss. A refused write (storage full or blocked) is not an error: the notice is hidden for this visit by the caller. */
export const dismissBillingNotice = (store: NoticeStore = LS): void => { store.set(KEY, true); };

export const BILLING_NOTICE_TEXT = 'Paid plans are here. Loadbearer stays free to use. A paid plan adds 30-day backups on your account. Nothing changes unless you subscribe.';
