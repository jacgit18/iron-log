import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import pg from 'pg';
import { adminsFrom } from '../admin.ts';

/* ---------- Sign-in: Better Auth inside our API (ADR 004) ----------
   Google only, no plugins. Sessions are server-side rows with a 30-day sliding lifetime, so a two-day offline gap never forces
   a re-login (FM-16). The version is pinned exactly (1.7.7): advisory GHSA-965c-763c-88jm (OAuth state usable as a magic link)
   affects 1.4.0-beta.18 to 1.7.6 and needs the Magic Link plugin, which is not used; 1.7.7 is the fix. Turn on dependency alerts.
   Its tables are in the `auth` schema (migration 008) and are reached by schema-qualified name, never by search_path. */

export interface AuthConfig {
  /** The exact public origin of this API, e.g. https://iron-log-xxxx.run.app or http://localhost:3002. */
  baseURL: string;
  /** At least 32 characters, random. Signs cookies and encrypts stored tokens. */
  secret: string;
  databaseUrl: string;
  google: { clientId: string; clientSecret: string };
  /** Email and password sign-in for automated tests only. Never in production: see createAuth. */
  testSignIn?: boolean;
  /** The most accounts that may exist (SIGNUP_CAP). A new Google account past it is refused; unset means no cap. Existing accounts always sign in. */
  signupCap?: number;
  /** Emails (lower case) that may sign up past the cap, e.g. the admins. */
  capExempt?: ReadonlySet<string>;
}

export const SESSION_DAYS = 30;
const DAY = 60 * 60 * 24;

export function createAuth(config: AuthConfig, env: string | undefined = process.env.NODE_ENV) {
  // Email and password registration is open to anyone who can reach the API, so it must not exist in production.
  if (config.testSignIn && env !== 'development' && env !== 'test') {
    throw new Error('testSignIn (email and password sign-in) is for tests only and cannot be enabled when NODE_ENV is not development or test');
  }
  const origin = new URL(config.baseURL);
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  // An idle pooled connection can be dropped at any time (a database restart, Neon scaling to zero). pg reports that as an 'error'
  // event on the pool; with no listener Node would crash the whole process (see createDb, which does the same for the other pool).
  pool.on('error', err => {
    console.error(JSON.stringify({ msg: 'idle auth database connection dropped', error: err.message }));
  });
  const auth = betterAuth({
    baseURL: config.baseURL,
    secret: config.secret,
    database: pool,
    user: { modelName: 'auth.user' },
    session: { modelName: 'auth.session', expiresIn: SESSION_DAYS * DAY, updateAge: DAY },
    account: {
      modelName: 'auth.account',
      // We only need to know who signed in, but Better Auth keeps Google's tokens; keep them encrypted, not in the clear.
      encryptOAuthTokens: true,
    },
    verification: { modelName: 'auth.verification' },
    // The cap on accounts (SIGNUP_CAP). Runs only when an account is about to be made, so someone who already has one is never
    // affected. The count and the insert are not one step, so two people signing up at the very same moment can overshoot by one.
    databaseHooks: {
      user: {
        create: {
          before: async user => {
            const cap = config.signupCap;
            if (cap === undefined || config.capExempt?.has(String(user.email ?? '').toLowerCase())) return;
            const { rows } = await pool.query<{ n: string }>('select count(*) as n from auth."user"');
            if (Number(rows[0]!.n) >= cap) {
              console.warn(JSON.stringify({ msg: 'sign-up refused: account cap reached', cap }));
              throw new APIError('FORBIDDEN', { message: 'signups_full' });
            }
          },
        },
      },
    },
    socialProviders: { google: { clientId: config.google.clientId, clientSecret: config.google.clientSecret } },
    emailAndPassword: { enabled: config.testSignIn === true },
    // Only this origin may call the auth routes with a cookie.
    trustedOrigins: [origin.origin],
    // The session cookie is Secure whenever the API is served over https (always, outside local development).
    advanced: { useSecureCookies: origin.protocol === 'https:' },
  });
  return Object.assign(auth, { pool });
}

export type Auth = ReturnType<typeof createAuth>;

/** Everything the API needs to turn sign-in on, read from the environment; or the reasons it is off. */
export type AuthSetup = { enabled: true; config: AuthConfig } | { enabled: false; reasons: string[] };

export function authConfigFrom(env: NodeJS.ProcessEnv): AuthSetup {
  const reasons: string[] = [];
  const need = (name: string) => {
    const v = env[name]?.trim();
    if (!v) reasons.push(`${name} is not set`);
    return v ?? '';
  };
  const secret = need('BETTER_AUTH_SECRET');
  const clientId = need('GOOGLE_CLIENT_ID');
  const clientSecret = need('GOOGLE_CLIENT_SECRET');
  const baseURL = need('BASE_URL');
  const databaseUrl = need('DATABASE_URL');
  if (secret && secret.length < 32) reasons.push('BETTER_AUTH_SECRET is shorter than 32 characters');
  if (baseURL) {
    try {
      const u = new URL(baseURL);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') reasons.push('BASE_URL must start with http:// or https://');
      else if (u.protocol === 'http:' && env.NODE_ENV === 'production') reasons.push('BASE_URL must be https in production');
      else if (u.pathname !== '/' || u.search || u.hash) reasons.push('BASE_URL must be an origin only, with no path');
    } catch {
      reasons.push('BASE_URL is not a valid URL');
    }
  }
  // SIGNUP_CAP: the most accounts allowed; unset or empty means no cap. A bad value turns sign-in off rather than quietly opening it.
  let signupCap: number | undefined;
  const capText = env.SIGNUP_CAP?.trim();
  if (capText) {
    if (/^\d{1,6}$/.test(capText)) signupCap = Number(capText);
    else reasons.push('SIGNUP_CAP must be a whole number');
  }
  if (reasons.length) return { enabled: false, reasons };
  return {
    enabled: true,
    config: { baseURL: new URL(baseURL).origin, secret, databaseUrl, google: { clientId, clientSecret }, testSignIn: env.AUTH_TEST_SIGNIN === 'true', signupCap, capExempt: adminsFrom(env.ADMIN_EMAILS) },
  };
}
