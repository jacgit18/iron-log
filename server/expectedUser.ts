import type { RequestHandler } from 'express';

// The signed-in user is the one this request is for (ADR 008 amendment; Alpha group B item 6, before SIGNUP_CAP goes past 25).
// A page keeps data of the account it first synced as. If another window then signs in as someone else, this page's
// cookie now belongs to the new user, and an unsent change would be written into the wrong account. The client says whom
// it thinks it is in the x-expected-user header (the internal user id /api/me returns); a request naming someone else is
// refused with 409 { ok: false, error: 'account' } before any route runs, so nothing is read or written. No header means
// no check, so an older client keeps working (MIN_CLIENT_VERSION can force an update later).

export const EXPECTED_USER_HEADER = 'x-expected-user';

/** Runs after sessionAuth, which sets res.locals.userId. Counts a refusal in the log without naming anyone. */
export function expectedUserGate(): RequestHandler {
  return (req, res, next) => {
    const expected = req.get(EXPECTED_USER_HEADER)?.trim();
    if (!expected || expected === String(res.locals.userId)) {
      next();
      return;
    }
    console.error(JSON.stringify({ msg: 'request refused: the page is for another account', route: req.baseUrl }));
    res.status(409).json({ ok: false, error: 'account' });
  };
}
