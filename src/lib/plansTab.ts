import type { AccountState } from '../sync/account.js';

// Whether the Plans tab is drawn (brief desktop-plans-tab). Desktop only: the phone's tab bar has no room, and the Android app must show no prices
// (ADR 065 point 8). Only a signed-in account on the free plan, with billing on, has anything to buy; after subscribing the tab goes and
// billing lives in Settings. While the first who-am-I answer is pending nothing is drawn, so the bar does not change shape late for a
// subscriber (a free account's bar gains the tab once, at the end, where nothing else moves).
export function showPlansTab(wide: boolean, who: AccountState | null): boolean {
  if (!wide || who === null || who.status !== 'signed-in') return false;
  const plan = who.plan ?? (who.isPaid ? 'paid' : 'free');
  return plan === 'free' && who.billing?.available === true;
}

// The plans as shown inside the app. Plus is users.plan 'paid' (the shown name is Plus). Pro is planned, not for sale, no stored value yet.
// The amounts must match the two Stripe prices (STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY); Stripe, not this text, is what is charged.
export const PLAN_CARDS = [
  { name: 'Free', price: '$0', lines: ['The weekly board, logging, programs and progress', 'Sync across your devices', 'Export and delete your data', '7 daily backups kept in your browser'] },
  { name: 'Plus', price: '$5.99 a month, or $49.99 a year', lines: ['Everything in Free', '30 daily backups kept on your account, to restore from'] },
  { name: 'Pro', price: 'Coming later, not priced yet', lines: ['Everything in Plus, plus AI features', 'Not available yet: a beta test comes first'] },
] as const;
