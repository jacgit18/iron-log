import type { RequestHandler } from 'express';

/* ---------- The oldest app that may sync (ADR 003, FM-03) ----------
   A phone can keep an old copy of the app for weeks (it works offline). An old copy may send a shape the API has since
   changed, and the API would drop what it does not know. When MIN_CLIENT_VERSION is set, an older app is refused with 426 and
   told the minimum, so it stops sending and keeps what it holds until it is updated.

   A version is the unix time, in seconds, of the commit the app was built from (vite.config.js). It orders builds without
   anyone having to bump a number. To require a build, set MIN_CLIENT_VERSION to `git log -1 --format=%ct <commit>`. */

export const CLIENT_VERSION_HEADER = 'x-client-version';
export const MIN_VERSION_HEADER = 'x-min-client-version';

/** A build's version, or null for anything that is not a plain number (a missing header, "dev"). */
export function parseVersion(value: string | undefined): number | null {
  return value !== undefined && /^\d{1,12}$/.test(value) ? Number(value) : null;
}

/** MIN_CLIENT_VERSION from the environment: null when unset, a number when valid. Anything else is an error: a gate that
 *  silently switches itself off because of a typo is worse than a server that will not start. */
export function minVersionFrom(env: string | undefined): number | null {
  if (env === undefined || env.trim() === '') return null;
  const n = parseVersion(env.trim());
  if (n === null) throw new Error(`MIN_CLIENT_VERSION must be a whole number (a commit time in seconds), got "${env}"`);
  return n;
}

/** Why the gate cannot be used with this build, or null. A MIN_CLIENT_VERSION newer than the build this server itself serves would refuse that very build (and so every app a user can get from it): a wrong commit or a typo. The server then refuses to start, so a deploy with a bad value never takes traffic and the revision before it keeps serving. `build` is the server's own APP_VERSION (the commit time the Docker build passes in). With no number there, the app this server serves is stamped "dev" (the same build argument), which the gate refuses wherever the development sign-in is not allowed (`allowDev` false: production), so a gate set on such a build locks everyone out too; where `allowDev` is true (a local run, a test) nothing is checked. */
export function minVersionProblem(min: number | null, build: string | undefined, allowDev: boolean): string | null {
  if (min === null) return null;
  const have = parseVersion(build?.trim());
  if (have === null) return allowDev ? null : `MIN_CLIENT_VERSION (${min}) is set but this build has no version number (it was built without APP_VERSION), so the app it serves calls itself "dev" and every user would be refused. Build the image with APP_VERSION=$(git log -1 --format=%ct), or unset MIN_CLIENT_VERSION.`;
  if (min <= have) return null;
  return `MIN_CLIENT_VERSION (${min}) is newer than the build this server serves (${have}), so every app, including the one it serves, would be refused. Deploy a build from the commit you mean first, or lower MIN_CLIENT_VERSION.`;
}

export interface GateOptions {
  /** The oldest version allowed, or null for no gate. */
  min: number | null;
  /** A development build calls itself "dev"; let it through only where the dev sign-in is allowed too. */
  allowDev: boolean;
}

export function clientVersionGate({ min, allowDev }: GateOptions): RequestHandler {
  return (req, res, next) => {
    if (min === null) return next();
    const sent = req.get(CLIENT_VERSION_HEADER);
    const version = parseVersion(sent);
    if (version !== null ? version >= min : allowDev && sent === 'dev') return next();
    res.setHeader(MIN_VERSION_HEADER, String(min));
    res.status(426).json({ ok: false, error: 'update-required', minClientVersion: min });
  };
}
