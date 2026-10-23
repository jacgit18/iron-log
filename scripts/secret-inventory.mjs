#!/usr/bin/env node
// The inventory of every secret and key Iron Log depends on: where it lives, what uses it and how to rotate it (secrets-and-keys-hygiene
// brief, item 1). It is data, and `scripts/secretInventory.test.js` fails when the deploy scripts or workflows name a secret that is not
// listed here, so the table cannot fall behind the code. It holds names only, never a value.
//
//   node scripts/secret-inventory.mjs        prints the table as markdown (paste it into the runbook, section 25, and fill "Last rotated" there)
//
// `optional: true` marks a secret that only exists once its feature is switched on (Stripe, Resend, Web Push, the moved owner URL): the parity job's
// secrets check does not flag it as missing. `{p}` stands for the environment's name prefix: iron-log (production), iron-log-staging, iron-log-qa. Where: SM = Google Secret Manager
// (project iron-log-jacgit18), GH = GitHub (repository or environment secret), LOCAL = a file or variable on the owner's machine.
export const PREFIXES = { production: 'iron-log', staging: 'iron-log-staging', qa: 'iron-log-qa' };

const ALL = ['production', 'staging', 'qa'];
export const INVENTORY = [
  { name: '{p}-app-database-url', where: 'SM', envs: ALL, usedBy: 'the service (restricted login: ironlog_app, ironlog_staging, ironlog_qa)', rotate: 'Reset that login\'s password in Neon, then `scripts/deploy-cloud-run.sh secrets` with the new APP_DATABASE_URL and a deploy', note: 'Never the owner login (RLS).' },
  { name: '{p}-google-client-id', where: 'SM', envs: ALL, usedBy: 'the service (Google sign-in)', rotate: 'Make a new OAuth client in the Google console (one per environment), `secrets` with the new id and secret, deploy', note: 'Each environment has its own client (ADR 057, 060); `secrets` refuses to reuse another\'s.' },
  { name: '{p}-google-client-secret', where: 'SM', envs: ALL, usedBy: 'the service (Google sign-in)', rotate: 'Add a new secret to the same OAuth client in the console, `secrets`, deploy, then delete the old one in the console', note: '' },
  { name: '{p}-auth-secret', where: 'SM', envs: ALL, usedBy: 'the service (signs session cookies; Better Auth)', rotate: 'Delete the secret and run `secrets` (a new one is made); everyone is signed out', note: 'Made once and kept; changing it signs every user out.' },
  { name: 'iron-log-pii-key', where: 'SM', envs: ['production', 'staging'], usedBy: 'the service (seals names and emails, AES-256-GCM; ADR 046)', rotate: 'Not rotatable yet (no key id on sealed values; backlog security #1). Backed up in your password manager (runbook 20)', note: 'Shared by production and staging (ADR 057); losing it loses every name and email.' },
  { name: 'iron-log-qa-pii-key', where: 'SM', envs: ['qa'], usedBy: 'the QA service', rotate: 'Delete the secret and run `secrets` for QA; QA holds no real data', note: 'QA has its own key (ADR 060).' },
  { name: '{p}-stripe-secret-key', where: 'SM', optional: true, envs: ALL, usedBy: 'the service (Stripe API; optional)', rotate: 'Roll the key in the Stripe dashboard, `secrets` with STRIPE_*, deploy, then expire the old key', note: 'Staging and QA take test keys only (`secrets` refuses live keys there).' },
  { name: '{p}-stripe-webhook-secret', where: 'SM', optional: true, envs: ALL, usedBy: 'the service (verifies Stripe webhooks; optional)', rotate: 'Roll the signing secret on the endpoint in the Stripe dashboard, `secrets`, deploy', note: '' },
  { name: '{p}-stripe-price-monthly', where: 'SM', optional: true, envs: ALL, usedBy: 'the service (a price id; not secret, kept here so CI can pass it)', rotate: 'Only when the price changes', note: 'Not a secret.' },
  { name: '{p}-stripe-price-yearly', where: 'SM', optional: true, envs: ALL, usedBy: 'the service (a price id; not secret)', rotate: 'Only when the price changes', note: 'Not a secret.' },
  { name: 'iron-log-resend-api-key', where: 'SM', optional: true, envs: ['production'], usedBy: 'the service (the emailed sign-in code; optional)', rotate: 'Make a new key in Resend, store it (`RESEND_API_KEY=... secrets`), deploy, delete the old key in Resend', note: 'Never stored for staging or QA (they send no email).' },
  { name: 'iron-log-vapid-private-key', where: 'SM', optional: true, envs: ['production'], usedBy: 'the service (Web Push signing; optional)', rotate: 'Do not rotate casually: a new pair orphans every subscribed device', note: 'Made once by `secrets` with VAPID_SUBJECT.' },
  { name: 'iron-log-vapid-public-key', where: 'SM', optional: true, envs: ['production'], usedBy: 'the service and the PWA (Web Push)', rotate: 'With the private key', note: 'Not a secret.' },
  { name: 'iron-log-vapid-subject', where: 'SM', optional: true, envs: ['production'], usedBy: 'the service (contact address for push services)', rotate: 'Change the address and `secrets`', note: 'Not a secret.' },
  { name: 'iron-log-backup-database-url', where: 'SM', envs: ['production'], usedBy: 'the nightly backup job (production OWNER url, unpooled)', rotate: 'Reset the owner password in Neon, then `scripts/backup-cloud-run.sh secret`', note: 'Only the backup account may read it.' },
  { name: 'iron-log-prod-owner-url', where: 'SM', optional: true, envs: ['production'], usedBy: 'the owner\'s `scripts/prod-db.sh` and the guard scripts (fetched on demand)', rotate: 'With the owner password: `scripts/prod-db.sh store-owner-url --apply`', note: 'Readable by project owners only; replaces DATABASE_URL_UNPOOLED in .env.' },
  { name: 'iron-log-parity-{e}-url', where: 'SM', envs: ALL, usedBy: 'the parity job (a read-only migrations_reader login on that database)', rotate: '`scripts/parity-job.sh reader <env> --host <host>` (makes a new password)', note: 'Added with the parity report (env-parity-report brief); read-only.' },
  { name: 'ANTHROPIC_API_KEY', where: 'GH', envs: ['repo'], usedBy: 'the PR review workflow (claude-review.yml)', rotate: 'New key in the Anthropic console, `gh secret set ANTHROPIC_API_KEY`, revoke the old key', note: 'Keep: the review bot uses it.' },
  { name: 'STAGING_DATABASE_URL', where: 'GH', envs: ['staging'], usedBy: 'the staging deploy job (dbmate up on the staging database)', rotate: 'Reset the owner password on the staging branch, update the secret', note: 'An owner URL in GitHub; phases B and C aim to remove it.' },
  { name: 'QA_DATABASE_URL', where: 'GH', envs: ['qa'], usedBy: 'the Deploy to QA workflow (migrations and the QA mark check)', rotate: '`scripts/qa-db.mjs reset` rotates the QA owner password; update the secret', note: 'An owner URL in GitHub; restricted to the main branch; phases B and C aim to remove it.' },
  { name: 'MIGRATIONS_CHECK_URL', where: 'GH', envs: ['production'], usedBy: 'the production deploy\'s "is production behind?" check', rotate: '`scripts/prod-db.sh reader --apply` (new password)', note: 'Read-only login. Currently NOT SET, which is why the deploy needs the migrations_applied box ticked.' },
  { name: 'DATABASE_URL_UNPOOLED (.env)', where: 'LOCAL', envs: ['production'], usedBy: 'the old place for production\'s owner URL (`scripts/prod-db.sh`, guard scripts)', rotate: 'Move it: `scripts/prod-db.sh store-owner-url --apply`, then delete the line', note: 'Deprecated; still read with a warning until removed.' },
  { name: 'PROD_DATABASE_URL (shell variable)', where: 'LOCAL', envs: ['production'], usedBy: 'scripts that need production\'s owner URL (first choice, before Secret Manager)', rotate: 'n/a (set per shell, not stored)', note: 'Do not put it in a file.' },
];

const expand = entry => entry.name.includes('{p}')
  ? entry.envs.map(e => entry.name.replace('{p}', PREFIXES[e]))
  : entry.name.includes('{e}') ? entry.envs.map(e => entry.name.replace('{e}', e)) : [entry.name];

/** Every concrete secret name in the inventory (prefixes expanded), for the tests. */
export const inventoryNames = () => new Set(INVENTORY.flatMap(expand));

/** The inventory as a markdown table (names only). "Last rotated" is left for the owner to fill in the runbook. */
export function toMarkdown() {
  const rows = INVENTORY.map(e => `| \`${e.name}\` | ${e.where} | ${e.envs.join(', ')} | ${e.usedBy} | ${e.rotate} | ${e.note} | |`);
  return ['| Name | Where | Environments | Used by | How to rotate | Notes | Last rotated |', '|---|---|---|---|---|---|---|', ...rows].join('\n');
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) console.log(toMarkdown());
