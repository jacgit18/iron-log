import type { RequestHandler } from 'express';

// A suspended account (brief admin-accounts-screen): an admin set users.suspended_at. After sign-in, every API call from it is refused 403
// `account_suspended`, except the few that let the person see why and take their own data away: /api/me (says `suspended: true`, so the app
// shows the notice), erase-data and delete (the privacy promise holds for a suspended person too). Sign-in itself is not blocked. Nothing is
// deleted and no session is ended, so a restore works at once.

/** The paths (under /api, any letter case, an optional trailing slash) a suspended account may still call. */
const STILL_ALLOWED = /^\/(me|account\/erase-data|account\/delete)\/?$/i;

export const mayCallWhileSuspended = (path: string): boolean => STILL_ALLOWED.test(path);

/** Mounted at /api after sessionAuth, so `req.path` is relative to /api. */
export const suspendedGate: RequestHandler = (req, res, next) => {
  if (res.locals.suspended !== true || mayCallWhileSuspended(req.path)) return next();
  res.status(403).json({ ok: false, error: 'account_suspended' });
};
