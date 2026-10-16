import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { kyselyAdapter } from '@better-auth/kysely-adapter';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { adminsFrom } from '../admin.ts';
import { POOL_OPTIONS } from '../db/poolOptions.ts';
import { encryptedAdapter } from './encryptedAdapter.ts';
import { otpHasher } from './otpHash.ts';
import { createPiiCrypto, parsePiiKey } from './piiCrypto.ts';
import { CODE_MINUTES, perAddressLimit, RESEND_TEST_FROM, resendSender, type SendCode } from './otpEmail.ts';

/* ---------- Sign-in: Better Auth inside our API (ADR 004) ----------
   Google, plus an emailed one-time code (emailOTP, ADR 042) when RESEND_API_KEY is set. Sessions are server-side rows with a 30-day sliding lifetime, so a two-day offline gap never forces
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
  /** How a sign-in code is delivered (otpEmail.ts). Unset: email-code sign-in is off. */
  sendCode?: SendCode;
  /** True: only the addresses in `capExempt` (the admins) may use the emailed code, on the server, whatever the app shows. authConfigFrom turns it on unless EMAIL_CODE_OPEN=true. */
  emailCodeAdminsOnly?: boolean;
  /** Email and password sign-in for automated tests only. Never in production: see createAuth. */
  testSignIn?: boolean;
  /** The most accounts that may exist (SIGNUP_CAP). A new Google account past it is refused; unset means no cap. Existing accounts always sign in. */
  signupCap?: number;
  /** Emails (lower case) that may sign up past the cap, e.g. the admins. */
  capExempt?: ReadonlySet<string>;
  /** PII_ENCRYPTION_KEY, 32 bytes. Set: names and emails are sealed in the database (ADR 046). Unset: stored as before. */
  piiKey?: Buffer;
  /** False once scripts/encrypt-users.mjs has sealed every row (PII_PLAINTEXT_DONE=true): lookups then stop matching plaintext emails. */
  piiMatchPlaintext?: boolean;
}

export const SESSION_DAYS = 30;
/** Codes sent to one address (per server instance, otpEmail.ts). */
export const OTP_PER_ADDRESS = { max: 3, windowMs: 10 * 60_000 };
const DAY = 60 * 60 * 24;

/**
 * Better Auth routes this app never calls, answered 404 before their handlers run. The app uses sign-in/social, the callback,
 * email-otp/send-verification-otp, sign-in/email-otp, sign-out and get-session (src/sync/account.ts); everything else the library
 * mounts is attack surface with no use. Most of all /email-otp/check-verification-otp, which counts a code's attempts with a plain
 * read then write (not the atomic consume the sign-in route uses), so parallel guesses beat the 3-attempt limit and a right guess is
 * not consumed. The email/password routes stay while testSignIn is on (the automated tests sign up through them).
 */
export function unusedAuthPaths(testSignIn: boolean): string[] {
  const paths = [
    '/email-otp/check-verification-otp',
    '/email-otp/verify-email',
    '/email-otp/reset-password',
    '/email-otp/request-password-reset',
    '/forget-password/email-otp',
    '/email-otp/request-email-change',
    '/email-otp/change-email',
    '/request-password-reset',
    '/reset-password',
    '/send-verification-email',
    '/verify-email',
    // Google's own tokens are never used by the app; the sign-in session is all it needs.
    '/get-access-token',
    '/refresh-token',
    '/account-info',
  ];
  return testSignIn ? paths : [...paths, '/sign-up/email'];
}

export function createAuth(config: AuthConfig, env: string | undefined = process.env.NODE_ENV) {
  // Email and password registration is open to anyone who can reach the API, so it must not exist in production.
  if (config.testSignIn && env !== 'development' && env !== 'test') {
    throw new Error('testSignIn (email and password sign-in) is for tests only and cannot be enabled when NODE_ENV is not development or test');
  }
  const origin = new URL(config.baseURL);
  const pool = new pg.Pool({ connectionString: config.databaseUrl, ...POOL_OPTIONS, max: 5 });
  // An idle pooled connection can be dropped at any time (a database restart, Neon scaling to zero). pg reports that as an 'error'
  // event on the pool; with no listener Node would crash the whole process (see createDb, which does the same for the other pool).
  pool.on('error', err => {
    console.error(JSON.stringify({ msg: 'idle auth database connection dropped', error: err.message }));
  });
  const pii = config.piiKey ? createPiiCrypto(config.piiKey) : undefined;
  const allowCode = perAddressLimit(OTP_PER_ADDRESS.max, OTP_PER_ADDRESS.windowMs);
  const auth = betterAuth({
    baseURL: config.baseURL,
    secret: config.secret,
    database: pii
      ? (options: BetterAuthOptions) =>
          encryptedAdapter(kyselyAdapter(new Kysely({ dialect: new PostgresDialect({ pool }) }), { type: 'postgres' })(options), pii, { matchPlaintext: config.piiMatchPlaintext !== false })
      : pool,
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
      // Better Auth records the IP address and browser string a session was made from. The app never reads them and an IP address is
      // personal data, so they are blanked before the row is written. (Not `advanced.ipAddress.disableIpTracking`: that also switches
      // off Better Auth's own per-IP rate limiting.) The migration of 2026-10-14 cleared the values stored before this.
      session: {
        create: {
          before: async session => ({ data: { ...session, ipAddress: null, userAgent: null } }),
        },
      },
      user: {
        create: {
          before: async user => {
            const cap = config.signupCap;
            // Like isAdmin: an address that is not verified proves nothing, so it does not get past the cap.
            const exempt = user.emailVerified === true && config.capExempt?.has(String(user.email ?? '').toLowerCase());
            if (cap === undefined || exempt) return;
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
    // The per-address limit runs BEFORE the plugin makes a code. The plugin stores each new code over the address's previous one, so
    // a request skipped after that point would wipe out the code the person was already sent and mail nothing in its place; anyone
    // who knew the address could then keep them out. Here a skipped request is answered as usual and touches nothing.
    hooks: {
      before: createAuthMiddleware(async ctx => {
        const body = ctx.body as { email?: unknown; type?: unknown } | undefined;
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
        // While the feature is owner-only, anyone else is turned away here, before a code is made, so calling the routes directly
        // creates no account and sends no mail. The answer is the usual one, so it does not reveal who is an admin.
        const notYet = config.emailCodeAdminsOnly === true && !config.capExempt?.has(email);
        if (ctx.path === '/sign-in/email-otp' && notYet) throw new APIError('BAD_REQUEST', { message: 'INVALID_OTP' });
        if (ctx.path !== '/email-otp/send-verification-otp' || body?.type !== 'sign-in' || !email) return;
        if (notYet) return ctx.json({ success: true });
        if (allowCode(email)) return;
        console.warn(JSON.stringify({ msg: 'sign-in code skipped: too many for one address' }));
        return ctx.json({ success: true });
      }),
    },
    plugins: config.sendCode
      ? [
          emailOTP({
            otpLength: 6,
            expiresIn: CODE_MINUTES * 60,
            allowedAttempts: 3,
            // Only a keyed hash is kept (otpHash.ts): a plain hash of six digits is undone in a moment, so without the secret a
            // read of the verification table does not reveal a live code.
            storeOTP: { hash: otpHasher(config.secret) },
            // Only a sign-in code is ever sent: the password-reset, email-change and verify-email uses are not offered.
            sendVerificationOTP: async ({ email, otp, type }) => {
              if (type !== 'sign-in') return;
              // Awaited on purpose: Cloud Run may pause the instance once the response is sent, which would drop a background send.
              // Better Auth swallows what this throws (the caller sees "sent" either way, which also stops address probing), so log it here.
              // The message never holds the address or the code.
              await config.sendCode!(email, otp).catch((err: unknown) => {
                console.error(JSON.stringify({ msg: 'sign-in code not sent', error: err instanceof Error ? err.message : String(err) }));
                throw err;
              });
            },
          }),
        ]
      : [],
    // Only this origin may call the auth routes with a cookie.
    trustedOrigins: [origin.origin],
    disabledPaths: unusedAuthPaths(config.testSignIn === true),
    // The session cookie is Secure whenever the API is served over https (always, outside local development).
    advanced: { useSecureCookies: origin.protocol === 'https:' },
  });
  // What the sign-in screen may offer a signed-out visitor (GET /api/auth-options). The server enforces owner-only on its own (the hook
  // above); this only lets the app hide a form that would not send a code. `open` is true once EMAIL_CODE_OPEN=true.
  const emailCode = { on: config.sendCode !== undefined, open: config.sendCode !== undefined && config.emailCodeAdminsOnly !== true };
  return Object.assign(auth, { pool, emailCode });
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
  // PII_ENCRYPTION_KEY is optional so the code can ship before the secret exists; once it is set, a bad value turns sign-in off
  // rather than quietly storing names and emails in the clear.
  let piiKey: Buffer | undefined;
  if (env.PII_ENCRYPTION_KEY?.trim()) {
    const parsed = parsePiiKey(env.PII_ENCRYPTION_KEY);
    if ('error' in parsed) reasons.push(parsed.error);
    else piiKey = parsed.key;
  }
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
  // RESEND_API_KEY turns email-code sign-in on; EMAIL_FROM is the sender (default: Resend's test address, which only reaches the account owner).
  const resendKey = env.RESEND_API_KEY?.trim();
  const sendCode = resendKey ? resendSender({ apiKey: resendKey, from: env.EMAIL_FROM?.trim() || RESEND_TEST_FROM }) : undefined;
  if (reasons.length) return { enabled: false, reasons };
  return {
    enabled: true,
    config: { baseURL: new URL(baseURL).origin, secret, databaseUrl, google: { clientId, clientSecret }, testSignIn: env.AUTH_TEST_SIGNIN === 'true', sendCode, emailCodeAdminsOnly: env.EMAIL_CODE_OPEN !== 'true', signupCap, capExempt: adminsFrom(env.ADMIN_EMAILS), piiKey, piiMatchPlaintext: env.PII_PLAINTEXT_DONE !== 'true' },
  };
}
