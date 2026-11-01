#!/usr/bin/env node
// Seeds the QA database with the test accounts in server/qa/personas.ts and their data (brief: qa-persona-picker).
//
//   QA_DATABASE_URL=<owner URL of the QA branch> node scripts/qa-seed.mjs --host <host> [--persona <id>] [--apply]
//
// Dry run unless --apply: prints what each account would get and changes nothing. With --apply, one transaction per account: the account is
// removed if it exists (auth user, session, and every row it owns) and made again, so a re-run puts each persona back to its starting state.
// Refuses unless the database carries the QA mark (scripts/qa-db.mjs reset sets it), so it cannot seed staging, production or a scratch copy.
// Names and emails are sealed with QA's own key, which only --apply needs: export it as QA_PII_ENCRYPTION_KEY (the value of the Secret Manager
// secret iron-log-qa-pii-key; never production's, whose rows QA could not open). The URL and the key are never printed.
// --host must be the host in the URL (typed on purpose), as in qa-db.mjs.
import { BUILTIN } from '../src/lib/data.ts';
import { createPiiCrypto, parsePiiKey } from '../server/auth/piiCrypto.ts';
import { PERSONAS, personaAuthId, personaEmail } from '../server/qa/personas.ts';
import { seedPersona } from '../server/qa/seedPersona.ts';
import { buildPersonaRows } from '../server/qa/seedPlan.ts';
import { connect, fail, guardHost, readMark } from './lib/db-script.mjs';

const MARKER = 'iron-log qa';
const args = process.argv.slice(2);
const flag = name => args.indexOf(name);
const value = name => (flag(name) >= 0 ? args[flag(name) + 1] : undefined);
const apply = args.includes('--apply');
const host = value('--host');
const only = value('--persona');
const url = process.env.QA_DATABASE_URL;

if (!url) fail('No QA_DATABASE_URL: set it to the owner URL of the QA branch.');
if (!host) fail('Usage: qa-seed.mjs --host <the host in QA_DATABASE_URL> [--persona <id>] [--apply]');
const chosen = only ? PERSONAS.filter(p => p.id === only) : PERSONAS;
if (!chosen.length) fail(`Unknown persona "${only}". Known: ${PERSONAS.map(p => p.id).join(', ')}`);
let crypto;
if (apply) {
  const key = parsePiiKey(process.env.QA_PII_ENCRYPTION_KEY);
  if ('error' in key) fail(`--apply needs QA's own key: ${key.error.replace('PII_ENCRYPTION_KEY', 'QA_PII_ENCRYPTION_KEY')}`);
  crypto = createPiiCrypto(key.key);
}
await guardHost(url, host, 'QA_DATABASE_URL');

const exerciseIds = [...new Set(['A', 'B'].flatMap(k => BUILTIN[k].days.flatMap(d => d.slots.flatMap(s => s.items.map(i => i.ex)))))];
const today = new Date();
const client = await connect(url, 'QA');
let code = 0;
try {
  const mark = await readMark(client);
  if (mark !== MARKER) fail(`This database is not marked as QA (mark: ${mark ?? 'none'}). Nothing was changed.`);
  console.log(`database host: ${new URL(url).hostname}`);
  for (const persona of chosen) {
    const rows = buildPersonaRows(persona, exerciseIds, today);
    console.log(`${apply ? 'seeding' : 'would seed'}: ${persona.id} (${persona.plan}${persona.planStatus ? `, ${persona.planStatus}` : ''}): ${rows.programs ? 2 : 0} programs, ${rows.logs.length} log entries, ${rows.body.length} body weights, ${rows.groceryItems.length} grocery items${rows.erased ? ', erased' : ''}`);
    if (apply) await seedPersona(client, crypto, persona, rows, today);
  }
  if (!apply) console.log('Dry run. Add --apply to write these.');
} catch (e) {
  console.error(`Nothing more was changed: ${e instanceof Error ? e.message : String(e)}`);
  code = 1;
} finally {
  await client.end().catch(() => {});
}
process.exit(code);
