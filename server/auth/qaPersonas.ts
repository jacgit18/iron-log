import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint, sessionMiddleware } from 'better-auth/api';
import { deleteSessionCookie, expireCookie, setSessionCookie } from 'better-auth/cookies';
import type pg from 'pg';
import { PERSONAS, personaAuthId, personaById } from '../qa/personas.ts';

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
}

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

  return {
    id: 'qa-personas',
    endpoints: {
      listQaPersonas: createAuthEndpoint('/qa/personas', { method: 'GET', use: [sessionMiddleware] }, async ctx => {
        if (!(await isQa())) throw notFound();
        const session = ctx.context.session;
        const hasReturn = !!(await ctx.getSignedCookie(ctx.context.createAuthCookie(ADMIN_COOKIE).name, ctx.context.secret));
        // Someone already switched has no admin session of their own, only the way back; they may see where they are, not switch again.
        if (!isAdminSession(session) && !hasReturn) throw new APIError('FORBIDDEN', { message: 'Not allowed' });
        const current = PERSONAS.find(p => personaAuthId(p.id) === session.user.id)?.id ?? null;
        return ctx.json({
          ok: true,
          current,
          personas: PERSONAS.map(p => ({ id: p.id, name: p.name, group: p.group, plan: p.plan, planStatus: p.planStatus, scenario: p.scenario, tryThis: p.tryThis })),
        });
      }),

      switchQaPersona: createAuthEndpoint('/qa/personas/switch', { method: 'POST', use: [sessionMiddleware] }, async ctx => {
        if (!(await isQa())) throw notFound();
        const session = ctx.context.session;
        if (!isAdminSession(session)) throw new APIError('FORBIDDEN', { message: 'Not allowed' });
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
        await ctx.setSignedCookie(adminCookie.name, session.session.token, ctx.context.secret, { ...cookies.sessionToken.attributes, maxAge: PERSONA_SESSION_SECONDS });
        await setSessionCookie(ctx, { session: created, user: target }, true);
        return ctx.json({ ok: true, current: persona.id });
      }),

      returnFromQaPersona: createAuthEndpoint('/qa/personas/return', { method: 'POST', use: [sessionMiddleware] }, async ctx => {
        if (!(await isQa())) throw notFound();
        const adminCookie = ctx.context.createAuthCookie(ADMIN_COOKIE);
        const token = await ctx.getSignedCookie(adminCookie.name, ctx.context.secret);
        if (!token) throw new APIError('BAD_REQUEST', { message: 'You are not switched to a test account' });
        const admin = await ctx.context.internalAdapter.findSession(token);
        // The kept session must still exist, still be an admin's, and the current session must be one of the test accounts.
        if (!admin || !isAdminSession(admin) || !PERSONAS.some(p => personaAuthId(p.id) === ctx.context.session.user.id)) throw new APIError('FORBIDDEN', { message: 'Not allowed' });
        await ctx.context.internalAdapter.deleteSession(ctx.context.session.session.token);
        await setSessionCookie(ctx, admin, true);
        expireCookie(ctx, adminCookie);
        return ctx.json({ ok: true });
      }),
    },
  };
}
