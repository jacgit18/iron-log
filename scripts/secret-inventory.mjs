#!/usr/bin/env node
// The inventory of every secret and key Iron Log depends on: where it lives, what uses it and how to rotate it (secrets-and-keys-hygiene
// brief, item 1). It is data, and `scripts/secretInventory.test.js` fails when the deploy scripts or workflows name a secret that is not
// listed here, so the table cannot fall behind the code. It holds names only, never a value.
//
//   node scripts/secret-inventory.mjs --encode   prints the Secret Manager entries as one base64 argument (what parity-run.sh hands the parity job)
//   node scripts/secret-inventory.mjs        prints the table as markdown (paste it into the runbook, section 25, and fill "Last rotated" there)
//
// `optional: true` marks a secret that only exists once its feature is switched on (Resend, the moved owner URL): the parity job's secrets check does
// not flag it as missing. `optional: 'stripe'` / `'push'` marks a GROUP deploy treats as one (deploy-cloud-run.sh checks only the `trigger` secret, then maps every
// secret of the group): once the trigger exists in an environment, the rest of its group is required there, and a missing member is MISSING. `{p}` stands for the environment's name prefix: iron-log (production), iron-log-staging, iron-log-qa. Where: SM = Google Secret Manager
// (project iron-log-jacgit18), GH = GitHub (repository or environment secret), LOCAL = a file or variable on the owner's machine.
export const PREFIXES = { production: 'iron-log', staging: 'iron-log-staging', qa: 'iron-log-qa' };

const ALL = ['production', 'staging', 'qa'];
export const INVENTORY = [
  { name: '{p}-app-database-url', where: 'SM', envs: ALL, usedBy: 'the service (restricted login: ironlog_app, ironlog_staging, ironlog_qa)', rotate: 'Reset that login\'s password in Neon, then `scripts/deploy-cloud-run.sh secrets` with the new APP_DATABASE_URL and a deploy', note: 'Never the owner login (RLS).' },
  { name: '{p}-google-client-id', where: 'SM', envs: ALL, usedBy: 'the service (Google sign-in)', rotate: 'Make a new OAuth client in the Google console (one per environment), `secrets` with the new id and secret, deploy', note: 'Each environment has its own client (ADR 057, 060); `secrets` refuses to reuse another\'s.' },
  { name: '{p}-google-client-secret', where: 'SM', envs: ALL, usedBy: 'the service (Google sign-in)', rotate: 'Add a new secret to the same OAuth client in the console, `secrets`, deploy, then delete the old one in the console', note: '' },
  { name: '{p}-auth-secret', where: 'SM', envs: ALL, usedBy: 'the service (signs session cookies; Better Auth)', rotate: 'Delete the secret and run `secrets` (a new one is made); everyone is signed out', note: 'Made once and kept; changing it signs every user out.' },
  { name: 'iron-log-pii-key', where: 'SM', envs: ['production'], usedBy: 'the service (seals names and emails, AES-256-GCM; ADR 046)', rotate: 'Not rotatable yet (no key id on sealed values; backlog security #1). Backed up in your password manager (runbook 20)', note: 'Production only since backlog EP2 (staging has its own); losing it loses every name and email.' },
  { name: '{p}-pii-key', where: 'SM', envs: ['staging', 'qa'], usedBy: 'the staging and QA services (their own sealing keys)', rotate: 'Empty that database (`staging-db.mjs reset` / `qa-db.mjs reset`), delete the secret and run `secrets` for that environment', note: 'Neither holds real users\' data (ADRs 060, 057 revisited); not shared with production.' },
  { name: '{p}-stripe-secret-key', where: 'SM', optional: 'stripe', trigger: true, envs: ALL, usedBy: 'the service (Stripe API; optional)', rotate: 'Roll the key in the Stripe dashboard, `secrets` with STRIPE_*, deploy, then expire the old key', note: 'Staging and QA take test keys only (`secrets` refuses live keys there).' },
  { name: '{p}-stripe-webhook-secret', where: 'SM', optional: 'stripe', envs: ALL, usedBy: 'the service (verifies Stripe webhooks; optional)', rotate: 'Roll the signing secret on the endpoint in the Stripe dashboard, `secrets`, deploy', note: '' },
  { name: '{p}-stripe-price-monthly', where: 'SM', optional: 'stripe', envs: ALL, usedBy: 'the service (a price id; not secret, kept here so CI can pass it)', rotate: 'Only when the price changes', note: 'Not a secret.' },
  { name: '{p}-stripe-price-yearly', where: 'SM', optional: 'stripe', envs: ALL, usedBy: 'the service (a price id; not secret)', rotate: 'Only when the price changes', note: 'Not a secret.' },
  { name: 'iron-log-resend-api-key', where: 'SM', optional: true, envs: ['production'], usedBy: 'the service (the emailed sign-in code; optional)', rotate: 'Make a new key in Resend, store it (`RESEND_API_KEY=... secrets`), deploy, delete the old key in Resend', note: 'Never stored for staging or QA (they send no email).' },
  { name: '{p}-owner-database-url', where: 'SM', optional: true, envs: ['qa'], usedBy: 'the QA service only (the in-app Reset of QA test accounts runs the seed as the owner; optional)', rotate: 'Reset the owner password on the QA Neon branch, then `QA_OWNER_DATABASE_URL=... scripts/deploy-cloud-run.sh secrets` and deploy', note: 'The owner URL of the QA branch. Never stored or mapped for staging or production; QA_OWNER_OFF=1 removes it from the service.' },
  { name: '{p}-usda-api-key', where: 'SM', optional: true, envs: ALL, usedBy: 'the service (USDA FoodData Central search in Quick add; optional)', rotate: 'Request a new free key at fdc.nal.usda.gov/api-key-signup, `USDA_API_KEY=... scripts/deploy-cloud-run.sh usda`, deploy', note: 'Free; one key may be stored in all three environments. Without it the lookup says it is not available.' },
  { name: 'iron-log-vapid-private-key', where: 'SM', optional: 'push', trigger: true, envs: ['production'], usedBy: 'the service (Web Push signing; optional)', rotate: 'Do not rotate casually: a new pair orphans every subscribed device', note: 'Made once by `secrets` with VAPID_SUBJECT.' },
  { name: 'iron-log-vapid-public-key', where: 'SM', optional: 'push', envs: ['production'], usedBy: 'the service and the PWA (Web Push)', rotate: 'With the private key', note: 'Not a secret.' },
  { name: 'iron-log-vapid-subject', where: 'SM', optional: 'push', envs: ['production'], usedBy: 'the service (contact address for push services)', rotate: 'Change the address and `secrets`', note: 'Not a secret.' },
  { name: 'iron-log-backup-database-url', where: 'SM', envs: ['production'], usedBy: 'the nightly backup job (production OWNER url, unpooled)', rotate: 'Reset the owner password in Neon, then `scripts/backup-cloud-run.sh secret`', note: 'Only the backup account may read it.' },
  { name: 'iron-log-prod-owner-url', where: 'SM', envs: ['production'], usedBy: 'the production migrate job (iron-log-migrate, applies migrations in the approved deploy) and the owner\'s `scripts/prod-db.sh` and guard scripts (fetched on demand)', rotate: 'With the owner password: `scripts/prod-db.sh store-owner-url --apply`; the job reads `latest`, so it needs no other step; also `scripts/backup-cloud-run.sh secret`', note: 'Readable by the migrate job\'s account (iron-log-migrate@) and project owners; replaces DATABASE_URL_UNPOOLED in .env and the old PRODUCTION_DATABASE_URL GitHub secret (option B, brief production-migrate-job).' },
  { name: 'iron-log-parity-{e}-url', where: 'SM', envs: ALL, usedBy: 'the parity job and, for production, the migrate job (a read-only migrations_reader login on that database)', rotate: '`scripts/parity-job.sh reader <env> --host <host>` (makes a new password; for production, then copy it to MIGRATIONS_CHECK_URL: `gcloud secrets versions access latest --secret iron-log-parity-production-url | gh secret set MIGRATIONS_CHECK_URL --env production`)', note: 'Added with the parity report (env-parity-report brief); read-only. Production\'s is shared with MIGRATIONS_CHECK_URL.' },
  { name: 'CLAUDE_CODE_OAUTH_TOKEN', where: 'GH', envs: ['repo'], usedBy: 'the PR review workflow (claude-review.yml); bills the Claude subscription, not API credits', rotate: 'Run `claude setup-token` in your own terminal (never in a chat), `gh secret set CLAUDE_CODE_OAUTH_TOKEN`, revoke the old row (user:inference only) under claude.ai Settings, Claude Code, Authorization tokens', note: 'Valid one year. Keep: the review bot uses it.' },
  { name: 'STAGING_DATABASE_URL', where: 'GH', envs: ['staging'], usedBy: 'the staging deploy job and the Migrate staging workflow (dbmate up on the staging database)', rotate: 'Reset the owner password on the staging branch, update the secret', note: 'An owner URL in GitHub; phases B and C aim to remove it.' },
  { name: 'QA_DATABASE_URL', where: 'GH', envs: ['qa'], usedBy: 'the Deploy to QA workflow (migrations and the QA mark check)', rotate: '`scripts/qa-db.mjs reset` rotates the QA owner password; update the secret', note: 'An owner URL in GitHub; restricted to the main branch; phases B and C aim to remove it.' },
  { name: 'MIGRATIONS_CHECK_URL', where: 'GH', envs: ['production'], usedBy: 'the production deploy\'s "is production behind?" check and its "none left" check (the migrate job reads the Secret Manager copy)', rotate: '`scripts/prod-db.sh reader --apply` (new password)', note: 'Read-only login; set 2026-10-23 as a copy of iron-log-parity-production-url, so the deploy asks production itself and needs no migrations_applied box. It is the SAME migrations_reader login the parity job uses: re-keying it (`prod-db.sh reader --apply` or `parity-job.sh reader production`) breaks the other until its secret is updated too.' },
  { name: 'DATABASE_URL_UNPOOLED (.env)', where: 'LOCAL', envs: ['production'], usedBy: 'the old place for production\'s owner URL (`scripts/prod-db.sh`, guard scripts)', rotate: 'Move it: `scripts/prod-db.sh store-owner-url --apply`, then delete the line', note: 'Deprecated; still read with a warning until removed.' },
  { name: 'PROD_DATABASE_URL (shell variable)', where: 'LOCAL', envs: ['production'], usedBy: 'scripts that need production\'s owner URL (first choice, before Secret Manager)', rotate: 'n/a (set per shell, not stored)', note: 'Do not put it in a file.' },
];

const expand = (entry, prefixes = PREFIXES) => entry.name.includes('{p}')
  ? entry.envs.map(e => entry.name.replace('{p}', prefixes[e]))
  : entry.name.includes('{e}') ? entry.envs.map(e => entry.name.replace('{e}', e)) : [entry.name];

/** Every concrete secret name in the inventory (prefixes expanded), for the tests. */
export const inventoryNames = (inventory = INVENTORY, prefixes = PREFIXES) => new Set(inventory.flatMap(e => expand(e, prefixes)));

/** The inventory as a markdown table (names only). "Last rotated" is left for the owner to fill in the runbook. */
export function toMarkdown() {
  const rows = INVENTORY.map(e => `| \`${e.name}\` | ${e.where} | ${e.envs.join(', ')} | ${e.usedBy} | ${e.rotate} | ${e.note} | |`);
  return ['| Name | Where | Environments | Used by | How to rotate | Notes | Last rotated |', '|---|---|---|---|---|---|---|', ...rows].join('\n');
}

/**
 * The Secret Manager part of the inventory as ONE comma-free argument (base64 JSON), for the parity job: `parity-run.sh` passes it on every run, like
 * the migration list, so the job checks main's inventory and not the copy baked into its image (gcloud splits `--args` on commas, hence base64).
 * Names and flags only, never a value.
 */
export function encodeInventory(inventory = INVENTORY, prefixes = PREFIXES) {
  const entries = inventory.filter(e => e.where === 'SM').map(({ name, envs, optional, trigger }) => ({ name, envs, optional: optional ?? false, trigger: !!trigger, where: 'SM' }));
  return Buffer.from(JSON.stringify({ prefixes, entries })).toString('base64');
}

/** Inverse of `encodeInventory`: { inventory, prefixes }. Throws on anything that is not that shape, so the job answers UNKNOWN, never a guess. */
export function decodeInventory(text) {
  const v = JSON.parse(Buffer.from(String(text), 'base64').toString('utf8'));
  const ok = v && typeof v.prefixes === 'object' && Array.isArray(v.entries) && v.entries.length
    && v.entries.every(e => e && typeof e.name === 'string' && Array.isArray(e.envs) && e.envs.every(x => typeof x === 'string' && x in v.prefixes));
  if (!ok) throw new Error('the inventory argument is not a valid inventory');
  return { inventory: v.entries, prefixes: v.prefixes };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) console.log(process.argv.includes('--encode') ? encodeInventory() : toMarkdown());
