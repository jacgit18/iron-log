// What the admin accounts screen writes, as pure functions (brief admin-accounts-screen).

/** "7 of 25 accounts" with a cap, "7 accounts, no cap set" without; "Full" once the cap is reached. */
export function capText(total: number, cap: number | null): string {
  if (cap === null) return `${total} ${total === 1 ? 'account' : 'accounts'}, no cap set`;
  return `${total} of ${cap} accounts${total >= cap ? ' (full)' : ''}`;
}

/** The cap bar's fill, 0 to 100; 0 with no cap. */
export const capPercent = (total: number, cap: number | null): number => (cap && cap > 0 ? Math.min(100, Math.round((total / cap) * 100)) : 0);

/** The words on the plan tag. */
export const planText = (plan: string): string => (plan === 'free' ? 'Free' : plan === 'beta' ? 'Beta' : plan[0] ? plan[0].toUpperCase() + plan.slice(1) : 'Unknown');

/** "Joined 14 Sep 2026" from an ISO time, in UTC so the same account reads the same everywhere. */
export function joinedText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Joined unknown' : `Joined ${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** One line of the log: "Suspended account 15", "Restored account 15", "Deleted an account" (a deleted account has no number left), or "Restored an account that was deleted". */
export function actionText(a: { action: string; targetId: string | null }): string {
  if (a.action === 'delete') return 'Deleted an account';
  return `${a.action === 'suspend' ? 'Suspended' : 'Restored'} ${a.targetId ? `account ${a.targetId}` : 'an account that was deleted'}`;
}

/** True when what was typed is the account's number (spaces around it ignored). Delete forever stays off until it is. */
export const deleteConfirmMatches = (typed: string, id: string): boolean => typed.trim() === id;

/** What the page says for each failure. */
export const SAY: Record<'failed' | 'forbidden' | 'offline' | 'refused' | 'gone' | 'unavailable' | 'changed', string> = {
  failed: 'Could not load the accounts. Try again.',
  forbidden: 'Not allowed. An admin needs both the admin list entry on the server and is_admin set in the database.',
  offline: 'You are offline. Accounts need a connection.',
  refused: 'That account cannot be changed: an admin account cannot be suspended or deleted, and an account must be suspended before it is deleted.',
  changed: 'The account changed while it was being deleted. Nothing was deleted, but its subscription was already ended; check it.',
  unavailable: 'Could not cancel the subscription, so nothing was deleted. Try again.',
  gone: 'That account no longer exists.',
};
