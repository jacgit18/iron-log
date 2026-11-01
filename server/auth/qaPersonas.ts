import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint, sessionMiddleware } from 'better-auth/api';
import { deleteSessionCookie, expireCookie, setSessionCookie } from 'better-auth/cookies';
import pg from 'pg';
import { pinSslMode } from '../db/sslMode.ts';
import { PERSONAS, personaAuthId, personaById } from '../qa/personas.ts';
import { SEED_EXERCISE_IDS, seedPersona } from '../qa/seedPersona.ts';
import { buildPersonaRows } from '../qa/seedPlan.ts';
import type { PiiCrypto } from './piiCrypto.ts';

/* ---------- QA test accounts: an admin switches to a seeded account and back (brief: qa-persona-picker) ----------
   A small plugin for Better Auth with three routes under /api/auth/qa/personas. It does what the library's own admin plugin does for impersonation (a
   short session for the other account, the admin's session token kept in a second signed cookie, put back on return) but with this app's rules:
   who is an admin comes from ADMIN_EMAILS (a verified email on that list), not from a role column, so there is no migration and nothing is added to
   production's tables. The library's admin plugin was read and not used: it decides admin by a stored role, mounts a dozen more routes, and would need
   five new columns.

   Three locks, each enough to stop a stranger on its own:
   1. the plugin is only added when QA_PERSONAS=true (set by the deploy script for the QA service only);
   2. every call checks that the database carries the QA mark (the comment scripts/qa-db.mjs sets), so a copy of this setting on staging or
      production still answers 404;
   3. every call needs a session whose email is verified and on the admin list. Nothing else can start a switch, and the only accounts reachable
      are the ones in server/qa/personas.ts (looked up by their fixed id; the request never names an email or a user id). */

export const QA_MARK = 'iron-log qa';
export const PERSONA_SESSION_SECONDS = 60 * 60;
const ADMIN_COOKIE = 'admin_session';

export interface QaPersonasConfig {
  /** Lower-case emails that count as admins (ADMIN_EMAILS). */
  admins: ReadonlySet<string>;
  pool: Pick<pg.Pool, 'query'>;
  /** The names and emails the auth tables seal (the same crypto the auth adapter uses); none when they are stored in the clear. */
  pii?: PiiCrypto;
  /** The owner URL of the QA branch (QA_OWNER_DATABASE_URL). Without it Reset is off. Used only after the QA-mark check. */
  ownerDatabaseUrl?: string;
  makeOwnerPool?: (url: string) => pg.Pool;
}

const CLEAR: PiiCrypto = { seal: x => x, sealStable: x => x, open: x => x, isSealed: () => false };

/** Whether this database is QA's. Cached once true; a false is asked again next time (a database marked after boot still works). */
export function qaMarkReader(pool: Pick<pg.Pool, 'query'>) {
  let yes = false;
  return async (): Promise<boolean> => {
    if (yes) return true;
    try {
      const { rows } = await pool.query<{ mark: string | null }>("select shobj_description(oid, 'pg_database') as mark from pg_database where datname = current_database()");
      yes = rows[0]?.mark === QA_MARK;
    } catch {
      return false;
    }
    return yes;
  };
}

export function qaPersonas(config: QaPersonasConfig): BetterAuthPlugin {
  const isQa = qaMarkReader(config.pool);
  const notFound = () => new APIError('NOT_FOUND', { message: 'Not found' });
  const isAdminSession = (s: { user: { email?: string | null; emailVerified?: boolean } }) =>
    s.user.emailVerified === true && !!s.user.email && config.admins.has(s.user.email.toLowerCase());

  // Reset needs the database owner (the API's own role cannot delete rows or set plans). The pool is made on the first reset, so a service
  // that is not QA never opens it: every route checks the QA mark first.
  let ownerPool: pg.Pool | undefined;
  let resetting = false;
  const owner = () => (ownerPool ??= (config.makeOwnerPool ?? (url => new pg.Pool({ connectionString: pinSslMode(url), max: 1, statement_timeout: 60_000 })))(config.ownerDatabaseUrl!));

  /** Whether the kept admin session behind a test account's session is still there, still an admin's, and not expired. */
  async function keptAdminOk(ctx: { context: { createAuthCookie: (n: string) => { name: string }; secret: string; internalAdapter: { findSession: (t: string) => Promise<{ session: { expiresAt: Date }; user: { email?: string | null; emailVerified?: boolean } } | null> } }; getSignedCookie: (n: string, s: string) => Promise<string | false | null | undefined> }) {
    const token = await ctx.getSignedCookie(ctx.context.createAuthCookie(ADMIN_COOKIE).name, ctx.context.secret);
    if (!token) return null;
    const admin = await ctx.context.internalAdapter.findSession(token);
    return admin && isAdminSession(admin) && admin.session.expiresAt > new Date() ? { token, admin } : null;
  }

  return {
    id: 'qa-personas',
    endpoints: {
      listQaPersonas: createAuthEndpoint('/qa/personas', { method: 'GET', use: [sessionMiddleware] }, async ctx => {
        if (!(await isQa())) throw notFound();
        const session = ctx.context.session;
        const current = PERSONAS.find(p => personaAuthId(p.id) === session.user.id)?.id ?? null;
        // Someone already switched has no admin session of their own, only the way back; the kept admin session must still be valid. The way back
        // counts only for a test account's session: the cookie is signed over its value, so any signed cookie value could be copied into it.
        if (!isAdminSession(session) && !(current && (await keptAdminOk(ctx)))) throw new APIError('FORBIDDEN', { message: 'Not allowed' });
        const { rows } = await config.pool.query<{ id: string }>('select id from auth."user" where id = any($1)', [PERSONAS.map(p => personaAuthId(p.id))]);
        const seeded = new Set(rows.map(r => r.id));
        return ctx.json({
          ok: true,
          current,
          canReset: !!config.ownerDatabaseUrl,
          personas: PERSONAS.map(p => ({ id: p.id, name: p.name, group: p.group, plan: p.plan, planStatus: p.planStatus, scenario: p.scenario, tryThis: p.tryThis, seeded: seeded.has(personaAuthId(p.id)) })),
        });
      }),

      switchQaPersona: createAuthEndpoint('/qa/personas/switch', { method: 'POST', use: [sessionMiddleware] }, async ctx => {
        if (!(await isQa())) throw notFound();
        const session = ctx.context.session;
        // An admin switches from their own session. A test account may switch to another directly, but only with the admin's session still kept behind it.
        const fromPersona = PERSONAS.some(p => personaAuthId(p.id) === session.user.id);
        const kept = isAdminSession(session) ? null : fromPersona ? await keptAdminOk(ctx) : null;
        if (!isAdminSession(session) && !kept) throw new APIError('FORBIDDEN', { message: 'Not allowed' });
        const id = (ctx.body as { id?: unknown } | undefined)?.id;
        const persona = typeof id === 'string' ? personaById(id) : undefined;
        if (!persona) throw new APIError('BAD_REQUEST', { message: 'Unknown test account' });
        const target = await ctx.context.internalAdapter.findUserById(personaAuthId(persona.id));
        if (!target) throw new APIError('NOT_FOUND', { message: 'That test account has not been seeded. Run qa:seed.' });
        const created = await ctx.context.internalAdapter.createSession(target.id, true, { expiresAt: new Date(Date.now() + PERSONA_SESSION_SECONDS * 1000) }, true);
        if (!created) throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Could not start the session' });
        const cookies = ctx.context.authCookies;
        const adminCookie = ctx.context.createAuthCookie(ADMIN_COOKIE);
        deleteSessionCookie(ctx);
        // From a test account the old test session goes, and the kept admin token is carried over with a fresh hour.
        if (kept) await ctx.context.internalAdapter.deleteSession(session.session.token);
        await ctx.setSignedCookie(adminCookie.name, kept ? kept.token : session.session.token, ctx.context.secret, { ...cookies.sessionToken.attributes, maxAge: PERSONA_SESSION_SECONDS });
        await setSessionCookie(ctx, { session: created, user: target }, true);
        return ctx.json({ ok: true, current: persona.id });
      }),

      resetQaPersona: createAuthEndpoint('/qa/personas/reset', { method: 'POST', use: [sessionMiddleware] }, async ctx => {
        if (!(await isQa())) throw notFound();
        const session = ctx.context.session;
        const fromPersona = PERSONAS.some(p => personaAuthId(p.id) === session.user.id);
        if (!isAdminSession(session) && !(fromPersona && (await keptAdminOk(ctx)))) throw new APIError('FORBIDDEN', { message: 'Not allowed' });
        const id = (ctx.body as { id?: unknown } | undefined)?.id;
        const persona = typeof id === 'string' ? personaById(id) : undefined;
        if (!persona) throw new APIError('BAD_REQUEST', { message: 'Unknown test account' });
        if (!config.ownerDatabaseUrl) throw new APIError('NOT_IMPLEMENTED', { message: 'Reset is not set up on this service' });
        // Deleting the account you hold would delete your own session.
        if (personaAuthId(persona.id) === session.user.id) throw new APIError('CONFLICT', { message: 'Switch away to reset it' });
        if (resetting) throw new APIError('CONFLICT', { message: 'A reset is already running' });
        resetting = true;
        try {
          const client = await owner().connect();
          try {
            const now = new Date();
            await seedPersona(client, config.pii ?? CLEAR, persona, buildPersonaRows(persona, SEED_EXERCISE_IDS, now), now);
          } finally {
            client.release();
          }
        } catch (e) {
          console.error(JSON.stringify({ msg: 'qa reset failed', persona: persona.id, error: e instanceof Error ? e.message : String(e) }));
          throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Reset failed. The account is as it was before.' });
        } finally {
          resetting = false;
        }
        return ctx.json({ ok: true, id: persona.id, seeded: true });
      }),

      returnFromQaPersona: createAuthEndpoint('/qa/personas/return', { method: 'POST', use: [sessionMiddleware] }, async ctx => {
        if (!(await isQa())) throw notFound();
        const adminCookie = ctx.context.createAuthCookie(ADMIN_COOKIE);
        const token = await ctx.getSignedCookie(adminCookie.name, ctx.context.secret);
        if (!token) throw new APIError('BAD_REQUEST', { message: 'You are not switched to a test account' });
        const admin = await ctx.context.internalAdapter.findSession(token);
        // The kept session must still exist, still be an admin's, and the current session must be one of the test accounts.
        if (!admin || !isAdminSession(admin) || admin.session.expiresAt <= new Date() || !PERSONAS.some(p => personaAuthId(p.id) === ctx.context.session.user.id)) throw new APIError('FORBIDDEN', { message: 'Not allowed' });
        await ctx.context.internalAdapter.deleteSession(ctx.context.session.session.token);
        // false: the admin's own session goes back as the usual 30-day cookie. The switch set the "don't remember" cookie for the test account's one hour; it goes too.
        await setSessionCookie(ctx, admin, false);
        expireCookie(ctx, ctx.context.authCookies.dontRememberToken);
        expireCookie(ctx, adminCookie);
        return ctx.json({ ok: true });
      }),
    },
  };
}
