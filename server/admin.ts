import type { RequestHandler } from 'express';
import type { Account } from './auth.ts';

// Who counts as an admin (feature flags, see src/features.ts). A list of names from ADMIN_EMAILS (comma separated, any case):
// a signed-in Google account matches by its verified email, a development user by `dev:<name>`. Unset means nobody is an admin.
// The browser only ever hides a feature; anything with an API route behind it must also use requireAdmin.

export type Admins = ReadonlySet<string>;

export function adminsFrom(value: string | undefined): Admins {
  return new Set((value ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
}

/** `emailVerified` must be true for a session; an unverified address proves nothing. */
export function isAdmin(account: Pick<Account, 'kind' | 'email' | 'name'>, admins: Admins, emailVerified = true): boolean {
  if (account.kind === 'dev') return !!account.name && admins.has(account.name.toLowerCase());
  return emailVerified && !!account.email && admins.has(account.email.toLowerCase());
}

/** For routes behind an admin-only feature. Runs after sessionAuth, which sets res.locals.account. */
export const requireAdmin: RequestHandler = (_req, res, next) => {
  if ((res.locals.account as Account | undefined)?.isAdmin === true) return next();
  res.status(403).json({ ok: false, error: 'not available' });
};
