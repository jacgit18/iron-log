import { Router } from 'express';
import { sql, type Kysely } from 'kysely';
import { inUserTransaction } from './auth.ts';
import type { DB } from './db/types.ts';
import { CURRENT_TERMS, isVersionText } from '../src/shared/termsVersion.ts';

// Recorded acceptance of the Terms of Use and the Privacy Policy (brief terms-acceptance). Mounted at /api/terms behind sign-in and a per-user limit
// (app.ts). The account row is made by Better Auth inside the Google callback or the email-code check, before the app can say which versions were
// ticked, so the app posts them here right after (ADR 090). Only the current versions are accepted: an old tab cannot record a stale one. Data routes
// are not blocked on the server (the person's own data stays reachable for export and delete); the gate is the app screen plus this record.

export interface StoredTermsRow { terms: string | null; privacy: string | null }

/** What /api/me says: the stored versions and whether they are the current ones. A dev header user or a QA persona counts as accepted (no box in tests of other features). */
export async function termsSummary(db: Kysely<DB>, userId: string, exempt: boolean): Promise<StoredTermsRow & { accepted: boolean }> {
  const row = await inUserTransaction(db, userId, async trx =>
    (await sql<{ terms: string | null; privacy: string | null }>`select terms_version as terms, privacy_version as privacy from users where id = current_setting('app.user_id')::bigint`.execute(trx)).rows[0]);
  return termsAnswer(row?.terms ?? null, row?.privacy ?? null, exempt);
}

/** The same answer from values already read (/api/me selects them with the plan, so it needs no second transaction). */
export function termsAnswer(terms: string | null, privacy: string | null, exempt: boolean): StoredTermsRow & { accepted: boolean } {
  return { terms, privacy, accepted: exempt || (terms === CURRENT_TERMS.terms && privacy === CURRENT_TERMS.privacy) };
}

export function termsRoutes({ db }: { db: Kysely<DB> }): Router {
  const router = Router();

  // Body { terms, privacy }: both must be the versions this server serves. Idempotent: the same call again changes nothing.
  router.post('/accept', async (req, res) => {
    const b = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    if (!isVersionText(b.terms) || !isVersionText(b.privacy)) return void res.status(400).json({ ok: false, error: 'send { terms, privacy } as version numbers like 1.3' });
    if (b.terms !== CURRENT_TERMS.terms || b.privacy !== CURRENT_TERMS.privacy) {
      return void res.status(409).json({ ok: false, error: 'not_current', current: CURRENT_TERMS });
    }
    await inUserTransaction(db, String(res.locals.userId), async trx => { await sql`select accept_terms(${b.terms as string}, ${b.privacy as string})`.execute(trx); });
    res.json({ ok: true, terms: CURRENT_TERMS.terms, privacy: CURRENT_TERMS.privacy });
  });

  return router;
}
