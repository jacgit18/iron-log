import { execFile, execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// A git hook (the pre-push check) exports GIT_DIR and friends; without this the throwaway repos below would commit into the real one.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));

// scripts/deploy-cloud-run.sh with a stand-in `gcloud` that records what it was asked to do, so the traffic handling (ADR 017) is checked
// without touching Google: a candidate gets no traffic, promote moves it, and a plain deploy undoes any rollback pin.
const SCRIPT = resolve('scripts/deploy-cloud-run.sh');

describe('deploy-cloud-run.sh traffic commands', () => {
  let dir: string;
  let calls: string;
  const gcloudStub = `#!/usr/bin/env bash
echo "$*" >> "${'$'}CALLS_FILE"
# Read a piped secret value the way the real gcloud does. Exiting without reading lets the script's printf hit a closed pipe now and then,
# and set -o pipefail turns that SIGPIPE into exit 141.
case "$*" in *"--data-file=-"*) cat >/dev/null;; esac
case "$*" in
  *"projects describe"*) echo 123456;;
  # The Web Push setup is made once: SETUP_EXISTS=1 is a second run, where the queue and the invoker account are already there.
  *"tasks queues describe"*|*"service-accounts describe"*) [ "$SETUP_EXISTS" = 1 ] && exit 0; exit 1;;
  # What the account may do is set by the test: SECRETS_READABLE=1 is your machine (it can see a secret exists), unset is the CI deployer.
  # PUSH_SECRET=1: the Web Push keys are already stored (they are separate from SECRETS_READABLE so the Resend cases above stay about Resend).
  # IMAGE_EXISTS=1: an image for this commit is already in the registry (staging built it).
  # IMAGE_ERROR=1: the registry could not be asked (for example permission denied), unlike an image that is simply not there.
  *"artifacts docker images describe"*) [ "$IMAGE_EXISTS" = 1 ] && exit 0; [ "$IMAGE_ERROR" = 1 ] && { echo "ERROR: PERMISSION_DENIED: no access" >&2; exit 1; }; echo "ERROR: NOT_FOUND: Requested entity was not found." >&2; exit 1;;
  # PROD_CLIENT_ID: the Google client id production has stored.
  # PROD_CLIENT_UNREADABLE=1: the secret exists but this account cannot read its value.
  *"versions access latest --secret iron-log-google-client-id"*) [ "$PROD_CLIENT_UNREADABLE" = 1 ] && exit 1; echo "$PROD_CLIENT_ID";;
  # HAS_QA_PII_KEY=1: QA's own database encryption key is already stored.
  *"secrets describe iron-log-qa-pii"*) [ "$HAS_QA_PII_KEY" = 1 ] && exit 0; exit 1;;
  # HAS_STAGING_PII_KEY=1: staging's own database encryption key is already stored.
  *"secrets describe iron-log-staging-pii"*) [ "$HAS_STAGING_PII_KEY" = 1 ] && exit 0; exit 1;;
  # STAGING_CLIENT_ID: the Google client id staging has stored.
  *"versions access latest --secret iron-log-staging-google-client-id"*) echo "$STAGING_CLIENT_ID";;
  # STRIPE_SECRET=1: the Stripe billing secrets are already stored (separate, so the Resend, Push and database cases stay about themselves).
  *"secrets describe iron-log-stripe"*|*"secrets describe iron-log-staging-stripe"*|*"secrets describe iron-log-qa-stripe"*) [ "$STRIPE_SECRET" = 1 ] && exit 0; exit 1;;
  *"secrets describe iron-log-vapid"*) [ "$PUSH_SECRET" = 1 ] && exit 0; exit 1;;
  # HAS_PII_KEY=1: the database encryption key is already stored (separate again, so the Resend and Push cases stay about themselves).
  *"secrets describe iron-log-pii"*) [ "$HAS_PII_KEY" = 1 ] && exit 0; exit 1;;
  *"secrets describe"*) [ "$SECRETS_READABLE" = 1 ] && exit 0; exit 1;;
  # LIVE_RESEND=1 / LIVE_PUSH=1: the live service already maps RESEND_API_KEY / VAPID_PRIVATE_KEY from a secret.
  *"run services describe"*"--format=json"*)
    env='[]'
    [ "$LIVE_RESEND" = 1 ] && env='[{"name":"RESEND_API_KEY","valueFrom":{"secretKeyRef":{"name":"iron-log-resend-api-key","key":"latest"}}}]'
    [ "$DESCRIBE_FAIL" = 1 ] && { echo "ERROR: (gcloud.run.services.describe) UNAVAILABLE: network error" >&2; exit 1; }
    [ "$DESCRIBE_NOTFOUND" = 1 ] && { echo "ERROR: (gcloud.run.services.describe) NOT_FOUND: Cannot find service [iron-log-staging]" >&2; exit 1; }
    [ "$LIVE_STAGING_PII" = 1 ] && env='[{"name":"PII_ENCRYPTION_KEY","valueFrom":{"secretKeyRef":{"name":"iron-log-staging-pii-key","key":"latest"}}}]'
    [ "$LIVE_PII" = 1 ] && env='[{"name":"PII_ENCRYPTION_KEY","valueFrom":{"secretKeyRef":{"name":"iron-log-pii-key","key":"latest"}}}]'
    [ "$LIVE_STRIPE" = 1 ] && env='[{"name":"STRIPE_SECRET_KEY","valueFrom":{"secretKeyRef":{"name":"iron-log-stripe-secret-key","key":"latest"}}}]'
    [ "$LIVE_PUSH" = 1 ] && env='[{"name":"VAPID_PRIVATE_KEY","valueFrom":{"secretKeyRef":{"name":"iron-log-vapid-private-key","key":"latest"}}}]'
    echo '{"spec":{"template":{"spec":{"containers":[{"env":'"$env"'}]}}},"status":{"traffic":[{"revisionName":"iron-log-00001-aaa","percent":100},{"tag":"candidate","url":"https://candidate---iron-log-x.run.app","revisionName":"iron-log-00002-bbb"}]}}';;
esac
exit 0
`;
  const run = (args: string[], env: Record<string, string> = {}) =>
    new Promise<{ status: number; stdout: string; stderr: string }>(done => {
      execFile('bash', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8', env: { ...ENV, PATH: `${dir}:${process.env.PATH}`, PROJECT_ID: 'p', CALLS_FILE: calls, BUILD_SA: 'b@p.iam.gserviceaccount.com', ...env } }, (err, stdout, stderr) =>
        done({ status: err ? Number((err as { code?: number }).code ?? 1) : 0, stdout, stderr }));
    });
  const recorded = () => readFileSync(calls, 'utf8').trim().split('\n');

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'deploy-run-'));
    calls = join(dir, 'calls.log');
    writeFileSync(join(dir, 'gcloud'), gcloudStub);
    chmodSync(join(dir, 'gcloud'), 0o755);
    writeFileSync(join(dir, '.gitignore'), 'gcloud\ncalls.log\n');
    const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, env: { ...ENV, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('commit', '-q', '-m', 'x');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('candidate deploys with no traffic and a tag, and prints the tagged address', async () => {
    writeFileSync(calls, '');
    const out = await run(['candidate']);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('CANDIDATE_URL=https://candidate---iron-log-x.run.app');
    const deploy = recorded().find(l => l.includes('run deploy'))!;
    expect(deploy).toContain('--no-traffic');
    expect(deploy).toContain('--tag candidate');
    expect(deploy).toMatch(/COMMIT_SHA=[0-9a-f]{7,}/);
    expect(recorded().some(l => l.includes('update-traffic'))).toBe(false);
  });

  it('builds the image, unless one for this commit already exists (staging built it): then it reuses it, and FORCE_BUILD builds again (ADR 058)', async () => {
    writeFileSync(calls, '');
    expect((await run(['candidate'])).status).toBe(0);
    expect(recorded().some(l => l.includes('builds submit'))).toBe(true);
    writeFileSync(calls, '');
    const reused = await run(['candidate'], { IMAGE_EXISTS: '1' });
    expect(reused.status).toBe(0);
    expect(reused.stdout).toContain('reusing it');
    expect(recorded().some(l => l.includes('builds submit'))).toBe(false);
    expect(recorded().some(l => l.includes('run deploy'))).toBe(true);
    writeFileSync(calls, '');
    expect((await run(['candidate'], { IMAGE_EXISTS: '1', FORCE_BUILD: '1' })).status).toBe(0);
    expect(recorded().some(l => l.includes('builds submit'))).toBe(true);
  });

  it('builds with the build file named in CLOUDBUILD_CONFIG (the QA workflow uses main\'s), cloudbuild.yaml otherwise', async () => {
    writeFileSync(calls, '');
    expect((await run(['candidate'])).status).toBe(0);
    expect(recorded().find(l => l.includes('builds submit'))).toContain('--config cloudbuild.yaml ');
    writeFileSync(calls, '');
    expect((await run(['candidate'], { CLOUDBUILD_CONFIG: '/work/main/cloudbuild.yaml' })).status).toBe(0);
    expect(recorded().find(l => l.includes('builds submit'))).toContain('--config /work/main/cloudbuild.yaml ');
  });

  it('says so when it could not ask the registry whether the image exists, instead of silently building a different one', async () => {
    writeFileSync(calls, '');
    const out = await run(['candidate'], { IMAGE_ERROR: '1' });
    expect(out.status).toBe(0);
    expect(out.stderr).toContain('Could not check whether');
    expect(out.stderr).toContain('PERMISSION_DENIED');
    expect(recorded().some(l => l.includes('builds submit'))).toBe(true);
    writeFileSync(calls, '');
    expect((await run(['candidate'])).stderr).not.toContain('Could not check');
  });

  it('promote moves all traffic to the tag, then removes the tag', async () => {
    writeFileSync(calls, '');
    expect((await run(['promote'])).status).toBe(0);
    const traffic = recorded().filter(l => l.includes('update-traffic'));
    expect(traffic[0]).toContain('--to-tags candidate=100');
    expect(traffic[1]).toContain('--remove-tags candidate');
  });

  it('a plain deploy ends by pointing traffic at the latest revision, so a rollback pin cannot strand it', async () => {
    writeFileSync(calls, '');
    expect((await run(['deploy'])).status).toBe(0);
    const lines = recorded();
    expect(lines.find(l => l.includes('run deploy'))).not.toContain('--no-traffic');
    expect(lines[lines.length - 1]).toContain('update-traffic');
    expect(lines[lines.length - 1]).toContain('--to-latest');
  });

  // BASE_URL is the address people sign in on. It is the Cloud Run address unless PUBLIC_BASE_URL names a custom domain (ADR 073), and it is
  // applied on every deploy, so a later deploy cannot quietly put the Cloud Run address back.
  describe('the address people sign in on (PUBLIC_BASE_URL)', () => {
    const deployLine = () => recorded().find(l => l.includes('run deploy'))!;

    it('is the Cloud Run address when PUBLIC_BASE_URL is not set', async () => {
      writeFileSync(calls, '');
      expect((await run(['candidate'])).status).toBe(0);
      expect(deployLine()).toContain('BASE_URL=https://iron-log-123456.us-central1.run.app,');
    });

    it('is the custom domain on a deploy when PUBLIC_BASE_URL is set, and on the candidate too', async () => {
      for (const cmd of ['candidate', 'deploy']) {
        writeFileSync(calls, '');
        expect((await run([cmd], { PUBLIC_BASE_URL: 'https://loadbearer.app' })).status).toBe(0);
        expect(deployLine()).toContain('BASE_URL=https://loadbearer.app,');
        expect(deployLine()).not.toContain('BASE_URL=https://iron-log-123456');
      }
    });

    it('`url` prints it, for the Google console redirect URI', async () => {
      expect((await run(['url'], { PUBLIC_BASE_URL: 'https://loadbearer.app' })).stdout.trim()).toBe('https://loadbearer.app');
      expect((await run(['url'])).stdout.trim()).toBe('https://iron-log-123456.us-central1.run.app');
    });

    it('says so when a production deploy leaves PUBLIC_BASE_URL out, because that resets a custom domain', async () => {
      writeFileSync(calls, '');
      const out = await run(['candidate']);
      expect(out.status).toBe(0);
      expect(out.stderr).toContain('PUBLIC_BASE_URL is not set');
      writeFileSync(calls, '');
      expect((await run(['candidate'], { PUBLIC_BASE_URL: 'https://loadbearer.app' })).stderr).not.toContain('PUBLIC_BASE_URL is not set');
    });

    it.each(['https://localhost', 'https://a-b.example.app', 'https://a1.example.app:65535', 'https://example.app:1'])('accepts %s', async good => {
      writeFileSync(calls, '');
      expect((await run(['candidate'], { PUBLIC_BASE_URL: good })).status).toBe(0);
      expect(deployLine()).toContain(`BASE_URL=${good},`);
    });

    it('accepts a port', async () => {
      writeFileSync(calls, '');
      expect((await run(['candidate'], { PUBLIC_BASE_URL: 'https://loadbearer.app:8443' })).status).toBe(0);
      expect(deployLine()).toContain('BASE_URL=https://loadbearer.app:8443,');
    });

    it.each(['staging', 'qa'])('is refused for %s, so a value left in the shell cannot point it at production', async IRON_LOG_ENV => {
      writeFileSync(calls, '');
      const out = await run(['candidate'], { IRON_LOG_ENV, PUBLIC_BASE_URL: 'https://loadbearer.app' });
      expect(out.status).not.toBe(0);
      expect(out.stderr).toContain('PUBLIC_BASE_URL is for production only');
      expect(recorded().some(l => l.includes('builds submit') || l.includes('run deploy'))).toBe(false);
      expect((await run(['url'], { IRON_LOG_ENV, PUBLIC_BASE_URL: 'https://loadbearer.app' })).status).not.toBe(0);
    });

    // The workflow is what puts the value there, so the wiring is pinned: only the production job, and only the repository variable.
    it('the workflow passes the variable in the production job only', () => {
      const yml = readFileSync(resolve('.github/workflows/deploy-cloud-run.yml'), 'utf8');
      // One job's text, from its heading to the next job's. A job that is renamed or gone fails here instead of leaving an empty string that every `not.toContain` passes.
      const job = (name: string) => {
        const start = yml.indexOf(`\n  ${name}:`);
        expect(start, `job ${name} not found`).toBeGreaterThan(-1);
        const rest = yml.slice(start + 1);
        const next = rest.slice(1).search(/\n  [A-Za-z_-]+:[ \t]*\n/);
        return next === -1 ? rest : rest.slice(0, next + 1);
      };
      const staging = job('staging');
      const production = job('deploy');
      expect(staging.length).toBeGreaterThan(200);
      expect(production.length).toBeGreaterThan(200);
      expect(yml.match(/^\s+PUBLIC_BASE_URL:/gm)).toHaveLength(1); // set once, as a key; a comment that names it does not count
      expect(production).toContain('PUBLIC_BASE_URL: ${{ vars.PRODUCTION_BASE_URL }}');
      expect(staging).not.toContain('PUBLIC_BASE_URL');
      // A failing script must fail the step, not be hidden by the pipe into tee.
      expect(production).toMatch(/set -o pipefail[^\n]*\n\s+scripts\/deploy-cloud-run\.sh candidate \| tee/);
    });

    it.each([
      'http://loadbearer.app', 'loadbearer.app', 'https://loadbearer.app/', 'https://loadbearer.app/path', 'https://load bearer.app', 'https://',
      'https://loadbearer.app?x=1', 'https://loadbearer.app#top', 'https://user@loadbearer.app', 'https://loadbearer.app\n', 'https://loadbearer.app\t',
      'https://loadbearer..app', 'https://-a.app', 'https://a-.app', 'https://.', 'https://loadbearer.app.', 'https://loadbearer.app:99999', 'https://loadbearer.app:0', 'https://loadbearer.app:',
    ])(
      'refuses %s before building or deploying anything',
      async bad => {
        writeFileSync(calls, '');
        const out = await run(['candidate'], { PUBLIC_BASE_URL: bad });
        expect(out.status).not.toBe(0);
        expect(out.stderr).toContain('PUBLIC_BASE_URL must');
        expect(recorded().some(l => l.includes('builds submit') || l.includes('run deploy'))).toBe(false);
      },
    );
  });

  // The key that seals names and emails (ADR 046) is made once by `secrets`, is never replaced, and must ride along on every deploy once it exists.
  describe('the database encryption key (ADR 046)', () => {
    const secretsOf = (cmd: string) => /--set-secrets (\S+)/.exec(recorded().find(l => l.includes(cmd))!)![1]!.split(',');
    const PII = 'PII_ENCRYPTION_KEY=iron-log-pii-key:latest';
    const baseEnv = { APP_DATABASE_URL: 'postgres://ironlog_app:pw@db.example.com/x', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'gs' };

    it('is passed when the secret exists (your machine)', async () => {
      writeFileSync(calls, '');
      const out = await run(['deploy'], { HAS_PII_KEY: "1" });
      expect(out.status).toBe(0);
      expect(secretsOf('run deploy')).toContain(PII);
      expect(out.stdout).toContain('PII_ENCRYPTION_KEY is passed');
    });

    it('is kept by a deploy that cannot read secrets (CI) when the live service already has it', async () => {
      writeFileSync(calls, '');
      expect((await run(['candidate'], { LIVE_PII: '1' })).status).toBe(0);
      expect(secretsOf('run deploy')).toContain(PII);
    });

    it('is left out before the key exists', async () => {
      writeFileSync(calls, '');
      expect((await run(['deploy'])).status).toBe(0);
      expect(secretsOf('run deploy').some(x => x.startsWith('PII_ENCRYPTION_KEY'))).toBe(false);
    });

    it('is made by `secrets` only with PII_KEY_CREATE=1, kept (no new version) after, and its value is never shown', async () => {
      writeFileSync(calls, '');
      const none = await run(['secrets'], baseEnv);
      expect(none.stdout).toContain('not created');
      expect(recorded().some(l => l.includes('iron-log-pii-key') && !l.includes('secrets describe'))).toBe(false);
      writeFileSync(calls, '');
      const first = await run(['secrets'], { ...baseEnv, PII_KEY_CREATE: '1' });
      expect(first.status).toBe(0);
      expect(recorded().some(l => l.includes('secrets create iron-log-pii-key'))).toBe(true);
      expect(recorded().some(l => l.includes('secrets versions add iron-log-pii-key'))).toBe(true);
      expect(recorded().some(l => l.includes('add-iam-policy-binding iron-log-pii-key') && l.includes('iron-log-run@p.iam.gserviceaccount.com'))).toBe(true);
      writeFileSync(calls, '');
      const again = await run(['secrets'], { ...baseEnv, HAS_PII_KEY: "1" });
      expect(again.status).toBe(0);
      expect(recorded().some(l => l.includes('iron-log-pii-key') && (l.includes('secrets create') || l.includes('versions add')))).toBe(false);
      expect(again.stdout).toContain('iron-log-pii-key: kept');
    });
  });

  // --set-secrets replaces the service's whole secret list, so the Stripe settings have to be in it on every deploy that should keep billing (ADR 065).
  describe('the Stripe billing settings', () => {
    const FOUR = ['APP_DATABASE_URL=iron-log-app-database-url:latest', 'BETTER_AUTH_SECRET=iron-log-auth-secret:latest', 'GOOGLE_CLIENT_ID=iron-log-google-client-id:latest', 'GOOGLE_CLIENT_SECRET=iron-log-google-client-secret:latest'];
    const stripeFor = (prefix: string) => [`STRIPE_SECRET_KEY=${prefix}-stripe-secret-key:latest`, `STRIPE_WEBHOOK_SECRET=${prefix}-stripe-webhook-secret:latest`, `STRIPE_PRICE_MONTHLY=${prefix}-stripe-price-monthly:latest`, `STRIPE_PRICE_YEARLY=${prefix}-stripe-price-yearly:latest`];
    const secretsOf = (cmd: string) => /--set-secrets (\S+)/.exec(recorded().find(l => l.includes(cmd))!)![1]!.split(',');
    const stripeEnv = { STRIPE_SECRET_KEY: 'sk_test_abc123', STRIPE_WEBHOOK_SECRET: 'whsec_abc123', STRIPE_PRICE_MONTHLY: 'price_m1', STRIPE_PRICE_YEARLY: 'price_y1' };
    const base = { APP_DATABASE_URL: 'postgres://ironlog_app:pw@db.example.com/x', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'gs' };

    it('are passed, with the other four, when the secrets exist in Secret Manager (your machine)', async () => {
      writeFileSync(calls, '');
      expect((await run(['deploy'], { STRIPE_SECRET: '1' })).status).toBe(0);
      expect(secretsOf('run deploy')).toEqual([...FOUR, ...stripeFor('iron-log')]);
    });

    it('are kept by a deploy that cannot read secrets (CI) when the live service already has them', async () => {
      writeFileSync(calls, '');
      const out = await run(['candidate'], { LIVE_STRIPE: '1' });
      expect(out.status).toBe(0);
      expect(secretsOf('run deploy')).toEqual([...FOUR, ...stripeFor('iron-log')]);
      expect(out.stdout).toContain('Stripe settings are passed');
    });

    it('are left out, and billing stays off, when they do not exist and the service does not have them', async () => {
      writeFileSync(calls, '');
      const out = await run(['deploy']);
      expect(secretsOf('run deploy').some(s => s.startsWith('STRIPE_'))).toBe(false);
      expect(out.stdout).toContain('billing stays off');
    });

    // server/billing.ts keeps billing off for an sk_live_ key unless BILLING_LIVE=1, so the production deploy has to be able to set it.
    it('BILLING_LIVE=1 is passed to a production deploy, so a live key turns billing on', async () => {
      writeFileSync(calls, '');
      const out = await run(['deploy'], { STRIPE_SECRET: '1', BILLING_LIVE: '1' });
      expect(out.status).toBe(0);
      expect(recorded().find(l => l.includes('run deploy'))!).toMatch(/--update-env-vars \S*BILLING_LIVE=1/);
      expect(out.stdout).toContain('BILLING_LIVE=1 is passed');
    });

    it('without BILLING_LIVE the deploy does not set it and says a live key needs it', async () => {
      writeFileSync(calls, '');
      const out = await run(['deploy'], { STRIPE_SECRET: '1' });
      expect(recorded().find(l => l.includes('run deploy'))!).not.toContain('BILLING_LIVE');
      expect(out.stdout).toContain('live (sk_live_) key also needs BILLING_LIVE=1');
    });

    it('BILLING_LIVE=1 is ignored for staging and QA, which take test keys only', async () => {
      writeFileSync(calls, '');
      const out = await run(['deploy'], { IRON_LOG_ENV: 'staging', STRIPE_SECRET: '1', BILLING_LIVE: '1', HAS_STAGING_PII_KEY: '1' });
      expect(recorded().find(l => l.includes('run deploy'))!).not.toContain('BILLING_LIVE');
      expect(out.stdout).toContain('BILLING_LIVE=1 is ignored for staging');
    });

    it('STRIPE_OFF=1 leaves them out even when they exist and the live service has them', async () => {
      writeFileSync(calls, '');
      const out = await run(['candidate'], { STRIPE_SECRET: '1', LIVE_STRIPE: '1', STRIPE_OFF: '1' });
      expect(secretsOf('run deploy').some(s => s.startsWith('STRIPE_'))).toBe(false);
      expect(out.stdout).toContain('STRIPE_OFF=1');
    });

    it('the secrets command stores all four, lets the runtime account read them, and no value is a gcloud argument', async () => {
      writeFileSync(calls, '');
      const out = await run(['secrets'], { ...base, ...stripeEnv });
      expect(out.status).toBe(0);
      const lines = recorded();
      for (const name of ['stripe-secret-key', 'stripe-webhook-secret', 'stripe-price-monthly', 'stripe-price-yearly']) {
        expect(lines.some(l => l.includes(`secrets create iron-log-${name}`))).toBe(true);
        expect(lines.some(l => l.includes(`add-iam-policy-binding iron-log-${name}`) && l.includes('iron-log-run@p.iam.gserviceaccount.com'))).toBe(true);
      }
      expect(lines.join('\n') + out.stdout + out.stderr).not.toMatch(/sk_test_abc123|whsec_abc123/);
    });

    it('the secrets command refuses a key without its three companions, and a value that is not a Stripe key', async () => {
      writeFileSync(calls, '');
      expect((await run(['secrets'], { ...base, STRIPE_SECRET_KEY: 'sk_test_abc123' })).status).not.toBe(0);
      expect((await run(['secrets'], { ...base, ...stripeEnv, STRIPE_SECRET_KEY: 'hello' })).status).not.toBe(0);
    });

    it('staging and QA take test keys only: a live key is refused, so a copy of production data cannot charge real cards', async () => {
      for (const IRON_LOG_ENV of ['staging', 'qa']) {
        writeFileSync(calls, '');
        const out = await run(['secrets'], { ...base, APP_DATABASE_URL: `postgres://ironlog_${IRON_LOG_ENV}:pw@db.example.com/x`, ...stripeEnv, STRIPE_SECRET_KEY: 'sk_live_abc123', IRON_LOG_ENV, HAS_PII_KEY: '1', HAS_QA_PII_KEY: '1', HAS_STAGING_PII_KEY: '1' });
        expect(out.status).not.toBe(0);
        expect(out.stderr).toContain('test keys only');
      }
    });

    it('the stripe command stores only the four, with no database or Google values, and lets the runtime account read them', async () => {
      writeFileSync(calls, '');
      const out = await run(['stripe'], { ...stripeEnv, IRON_LOG_ENV: 'staging' });
      expect(out.status).toBe(0);
      const lines = recorded();
      expect(lines.some(l => l.includes('secrets create iron-log-staging-stripe-secret-key'))).toBe(true);
      expect(lines.some(l => l.includes('add-iam-policy-binding iron-log-staging-stripe-webhook-secret') && l.includes('iron-log-staging-run@p.iam.gserviceaccount.com'))).toBe(true);
      expect(lines.some(l => l.includes('google-client') || l.includes('app-database-url'))).toBe(false);
      expect(lines.join('\n') + out.stdout + out.stderr).not.toMatch(/sk_test_abc123|whsec_abc123/);
    });

    it('the stripe command refuses a live key for staging and says what to export when a value is missing', async () => {
      expect((await run(['stripe'], { ...stripeEnv, STRIPE_SECRET_KEY: 'sk_live_abc123', IRON_LOG_ENV: 'staging' })).stderr).toContain('test keys only');
      const missing = await run(['stripe'], { STRIPE_SECRET_KEY: 'sk_test_abc123' });
      expect(missing.status).not.toBe(0);
      expect(missing.stderr).toContain('STRIPE_WEBHOOK_SECRET');
    });

    it('staging uses its own secret names', async () => {
      writeFileSync(calls, '');
      await run(['candidate'], { IRON_LOG_ENV: 'staging', STRIPE_SECRET: '1', HAS_STAGING_PII_KEY: '1' });
      expect(secretsOf('run deploy')).toEqual(expect.arrayContaining(stripeFor('iron-log-staging')));
    });
  });

  // --set-secrets replaces the service's whole secret list, so RESEND_API_KEY has to be in it on every deploy that should keep the email code.
  describe('the Resend key for the emailed sign-in code (ADR 042)', () => {
    const FOUR = ['APP_DATABASE_URL=iron-log-app-database-url:latest', 'BETTER_AUTH_SECRET=iron-log-auth-secret:latest', 'GOOGLE_CLIENT_ID=iron-log-google-client-id:latest', 'GOOGLE_CLIENT_SECRET=iron-log-google-client-secret:latest'];
    const RESEND = 'RESEND_API_KEY=iron-log-resend-api-key:latest';
    const secretsOf = (cmd: string) => /--set-secrets (\S+)/.exec(recorded().find(l => l.includes(cmd))!)![1]!.split(',');

    it('is passed, with the other four, when the secret exists in Secret Manager (your machine)', async () => {
      writeFileSync(calls, '');
      expect((await run(['deploy'], { SECRETS_READABLE: '1' })).status).toBe(0);
      expect(secretsOf('run deploy')).toEqual([...FOUR, RESEND]);
    });

    it('is kept by a deploy that cannot read secrets (CI) when the live service already has it', async () => {
      writeFileSync(calls, '');
      const out = await run(['candidate'], { LIVE_RESEND: '1' });
      expect(out.status).toBe(0);
      expect(secretsOf('run deploy')).toEqual([...FOUR, RESEND]);
      expect(out.stdout).toContain('RESEND_API_KEY is passed');
    });

    it('is left out, and the feature stays off, when the secret does not exist and the service does not have it', async () => {
      writeFileSync(calls, '');
      const out = await run(['deploy']);
      expect(out.status).toBe(0);
      expect(secretsOf('run deploy')).toEqual(FOUR);
      expect(out.stdout).toContain('stays off');
    });

    it('RESEND_OFF=1 leaves it out even when the secret exists and the live service has it, so the feature can be switched off', async () => {
      writeFileSync(calls, '');
      const out = await run(['candidate'], { SECRETS_READABLE: '1', LIVE_RESEND: '1', RESEND_OFF: '1' });
      expect(out.status).toBe(0);
      expect(secretsOf('run deploy')).toEqual(FOUR);
      expect(out.stdout).toContain('RESEND_OFF=1');
    });

    it('the secrets command stores it and lets the runtime account read it, and the value is never a gcloud argument', async () => {
      writeFileSync(calls, '');
      const env = { APP_DATABASE_URL: 'postgres://ironlog_app:pw@db.example.com/x', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'gs' };
      const out = await run(['secrets'], { ...env, RESEND_API_KEY: 're_secretvalue123' });
      expect(out.status).toBe(0);
      const lines = recorded();
      expect(lines.some(l => l.includes('secrets create iron-log-resend-api-key'))).toBe(true);
      expect(lines.some(l => l.includes('secrets versions add iron-log-resend-api-key'))).toBe(true);
      expect(lines.some(l => l.includes('add-iam-policy-binding iron-log-resend-api-key') && l.includes('iron-log-run@p.iam.gserviceaccount.com'))).toBe(true);
      expect(lines.join('\n') + out.stdout + out.stderr).not.toContain('re_secretvalue123');
    });

    it('the secrets command leaves it alone, and says so, when RESEND_API_KEY is not exported', async () => {
      writeFileSync(calls, '');
      const out = await run(['secrets'], { APP_DATABASE_URL: 'postgres://ironlog_app:pw@db.example.com/x', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'gs', RESEND_API_KEY: '' });
      expect(out.status).toBe(0);
      expect(recorded().some(l => l.includes('iron-log-resend-api-key'))).toBe(false);
      expect(out.stdout).toContain('not touched');
    });
  });

  // Web Push (ADR 044): the same shape as the Resend key, with three secrets, the queue settings as plain variables and a one-off setup command.
  describe('Web Push', () => {
    const FOUR = ['APP_DATABASE_URL=iron-log-app-database-url:latest', 'BETTER_AUTH_SECRET=iron-log-auth-secret:latest', 'GOOGLE_CLIENT_ID=iron-log-google-client-id:latest', 'GOOGLE_CLIENT_SECRET=iron-log-google-client-secret:latest'];
    const VAPID = ['VAPID_PUBLIC_KEY=iron-log-vapid-public-key:latest', 'VAPID_PRIVATE_KEY=iron-log-vapid-private-key:latest', 'VAPID_SUBJECT=iron-log-vapid-subject:latest'];
    const secretsOf = (cmd: string) => /--set-secrets (\S+)/.exec(recorded().find(l => l.includes(cmd))!)![1]!.split(',');
    const envOf = (cmd: string) => /--update-env-vars (\S+)/.exec(recorded().find(l => l.includes(cmd))!)![1]!;
    const base = { APP_DATABASE_URL: 'postgres://ironlog_app:pw@db.example.com/x', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'gs' };

    it('passes the keys and the queue settings when the secret exists (your machine)', async () => {
      writeFileSync(calls, '');
      const out = await run(['deploy'], { PUSH_SECRET: '1' });
      expect(out.status).toBe(0);
      expect(secretsOf('run deploy')).toEqual([...FOUR, ...VAPID]);
      expect(envOf('run deploy')).toContain('PUSH_QUEUE=projects/p/locations/us-central1/queues/iron-log-push');
      expect(envOf('run deploy')).toContain('PUSH_INVOKER_EMAIL=iron-log-push-invoker@p.iam.gserviceaccount.com');
      expect(out.stdout).toContain('VAPID keys');
    });

    it('is kept by a deploy that cannot read secrets (CI) when the live service already has it', async () => {
      writeFileSync(calls, '');
      expect((await run(['candidate'], { LIVE_PUSH: '1' })).status).toBe(0);
      expect(secretsOf('run deploy')).toEqual([...FOUR, ...VAPID]);
    });

    it('is left out, with no queue settings and nothing removed, when there are no keys', async () => {
      writeFileSync(calls, '');
      const out = await run(['deploy']);
      expect(secretsOf('run deploy')).toEqual(FOUR);
      expect(envOf('run deploy')).not.toContain('PUSH_');
      expect(recorded().find(l => l.includes('run deploy'))).not.toContain('--remove-env-vars');
      expect(out.stdout).toContain('push stays off');
    });

    it('PUSH_OFF=1 leaves the keys out and removes the queue settings, even when everything else says on', async () => {
      writeFileSync(calls, '');
      const out = await run(['candidate'], { PUSH_SECRET: '1', LIVE_PUSH: '1', PUSH_OFF: '1' });
      expect(out.status).toBe(0);
      expect(secretsOf('run deploy')).toEqual(FOUR);
      expect(recorded().find(l => l.includes('run deploy'))).toContain('--remove-env-vars PUSH_QUEUE,PUSH_INVOKER_EMAIL');
    });

    it('does not touch the Resend key either way', async () => {
      writeFileSync(calls, '');
      await run(['deploy'], { PUSH_SECRET: '1', RESEND_OFF: '1' });
      expect(secretsOf('run deploy')).toEqual([...FOUR, ...VAPID]);
    });

    it('the secrets command makes the pair once, stores it with the contact, lets the runtime account read all three, and never shows the private key', async () => {
      writeFileSync(calls, '');
      const out = await run(['secrets'], { ...base, VAPID_SUBJECT: 'mailto:me@example.com' });
      expect(out.status).toBe(0);
      const lines = recorded();
      for (const name of ['iron-log-vapid-public-key', 'iron-log-vapid-private-key', 'iron-log-vapid-subject']) {
        expect(lines.some(l => l.includes(`secrets create ${name}`)), name).toBe(true);
        expect(lines.some(l => l.includes(`secrets versions add ${name}`)), name).toBe(true);
        expect(lines.some(l => l.includes(`add-iam-policy-binding ${name}`) && l.includes('iron-log-run@p.iam.gserviceaccount.com')), name).toBe(true);
      }
      const generated = JSON.parse(execFileSync('node', [resolve('scripts/vapid-keys.mjs')], { encoding: 'utf8' })) as { publicKey: string; privateKey: string };
      expect(generated.publicKey).toHaveLength(87);
      expect(generated.privateKey).toHaveLength(43);
      expect(lines.join('\n') + out.stdout + out.stderr).not.toMatch(/[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/); // no private key (or any 43-character key) on a command line or in the output
    });

    it('keeps an existing pair (a new one would orphan every subscribed device) but still updates the contact', async () => {
      writeFileSync(calls, '');
      const out = await run(['secrets'], { ...base, VAPID_SUBJECT: 'mailto:me@example.com', PUSH_SECRET: '1' });
      expect(out.status).toBe(0);
      expect(recorded().some(l => l.includes('secrets create iron-log-vapid-private-key'))).toBe(false);
      expect(out.stdout).toContain('iron-log-vapid-private-key: kept');
    });

    it('refuses a contact that is not a mailto: or https: address, and leaves the keys alone without one', async () => {
      writeFileSync(calls, '');
      const bad = await run(['secrets'], { ...base, VAPID_SUBJECT: 'me@example.com' });
      expect(bad.status).not.toBe(0);
      expect(bad.stderr).toContain('mailto:');
      writeFileSync(calls, '');
      const none = await run(['secrets'], { ...base, VAPID_SUBJECT: '' });
      expect(none.status).toBe(0);
      expect(recorded().some(l => l.includes('vapid'))).toBe(false);
      expect(none.stdout).toContain('Web Push keys: not touched');
    });

    it('push-setup makes the queue (one attempt), the invoker account and the two permissions, and a second run makes nothing twice', async () => {
      writeFileSync(calls, '');
      expect((await run(['push-setup'])).status).toBe(0);
      const lines = recorded();
      expect(lines.some(l => l.includes('services enable cloudtasks.googleapis.com'))).toBe(true);
      expect(lines.find(l => l.includes('tasks queues create'))).toMatch(/iron-log-push --location us-central1 --max-attempts=1/);
      expect(lines.some(l => l.includes('service-accounts create iron-log-push-invoker'))).toBe(true);
      expect(lines.some(l => l.includes('tasks queues add-iam-policy-binding iron-log-push') && l.includes('serviceAccount:iron-log-run@p.iam.gserviceaccount.com') && l.includes('roles/cloudtasks.enqueuer'))).toBe(true);
      expect(lines.some(l => l.includes('service-accounts add-iam-policy-binding iron-log-push-invoker@p.iam.gserviceaccount.com') && l.includes('roles/iam.serviceAccountUser'))).toBe(true);
    });
  });

  // IRON_LOG_ENV=staging (ADRs 055 to 058): the same script deploys iron-log-staging with its own account, secrets and database key (backlog
  // EP2: no longer production's), and can never turn on email or push.
  describe('IRON_LOG_ENV=staging', () => {
    const secretsOf = (cmd: string) => /--set-secrets (\S+)/.exec(recorded().find(l => l.includes(cmd))!)![1]!.split(',');
    const stagingDb = { APP_DATABASE_URL: 'postgres://ironlog_staging:pw@db.example.com/x', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'gs' };

    it('deploys the staging service as its own runtime account with iron-log-staging-* secrets', async () => {
      writeFileSync(calls, '');
      const out = await run(['candidate'], { IRON_LOG_ENV: 'staging', HAS_STAGING_PII_KEY: '1' });
      expect(out.status).toBe(0);
      const deploy = recorded().find(l => l.includes('run deploy'))!;
      expect(deploy).toContain('run deploy iron-log-staging ');
      expect(deploy).toContain('--service-account iron-log-staging-run@p.iam.gserviceaccount.com');
      expect(deploy).toContain('--no-traffic');
      const secrets = secretsOf('run deploy');
      expect(secrets).toContain('APP_DATABASE_URL=iron-log-staging-app-database-url:latest');
      expect(secrets).toContain('BETTER_AUTH_SECRET=iron-log-staging-auth-secret:latest');
      expect(secrets).toContain('GOOGLE_CLIENT_ID=iron-log-staging-google-client-id:latest');
      expect(secrets).toContain('GOOGLE_CLIENT_SECRET=iron-log-staging-google-client-secret:latest');
      expect(deploy).toContain('BASE_URL=https://iron-log-staging-123456.us-central1.run.app');
    });

    it("passes staging's own database key once it exists, or once the live service already maps it (a CI deploy), never production's (backlog EP2)", async () => {
      for (const env of [{ HAS_STAGING_PII_KEY: '1' }, { LIVE_STAGING_PII: '1' }] as Record<string, string>[]) {
        writeFileSync(calls, '');
        expect((await run(['candidate'], { IRON_LOG_ENV: 'staging', ...env })).status).toBe(0);
        const secrets = secretsOf('run deploy');
        expect(secrets).toContain('PII_ENCRYPTION_KEY=iron-log-staging-pii-key:latest');
        expect(secrets).not.toContain('PII_ENCRYPTION_KEY=iron-log-pii-key:latest');
      }
    });

    it("keeps production's key until staging's own exists, when the live service maps it or there is no service yet", async () => {
      for (const env of [{ LIVE_PII: '1' }, { DESCRIBE_NOTFOUND: '1' }] as Record<string, string>[]) {
        writeFileSync(calls, '');
        // With no service the later traffic steps cannot describe it either, so only the deploy that was sent is checked.
        await run(['candidate'], { IRON_LOG_ENV: 'staging', ...env });
        const secrets = secretsOf('run deploy');
        expect(secrets).toContain('PII_ENCRYPTION_KEY=iron-log-pii-key:latest');
        expect(secrets.some(x => x.includes('iron-log-staging-pii-key'))).toBe(false);
      }
    });

    it("stops instead of falling back to production's key when the describe fails or the service maps no key", async () => {
      for (const env of [{ DESCRIBE_FAIL: '1' }, {}] as Record<string, string>[]) {
        writeFileSync(calls, '');
        const out = await run(['candidate'], { IRON_LOG_ENV: 'staging', ...env });
        expect(out.status).toBe(1);
        expect(out.stderr).toContain('Cannot tell which database key');
        expect(recorded().some(l => l.includes('run deploy'))).toBe(false);
      }
    });

    it('never passes the Resend or Web Push keys, even when they exist and the live service has them (ADR 056)', async () => {
      writeFileSync(calls, '');
      const out = await run(['candidate'], { IRON_LOG_ENV: 'staging', HAS_STAGING_PII_KEY: '1', SECRETS_READABLE: '1', PUSH_SECRET: '1', LIVE_RESEND: '1', LIVE_PUSH: '1' });
      expect(out.status).toBe(0);
      const secrets = secretsOf('run deploy');
      expect(secrets.some(x => x.startsWith('RESEND_API_KEY'))).toBe(false);
      expect(secrets.some(x => x.startsWith('VAPID_'))).toBe(false);
      expect(recorded().find(l => l.includes('run deploy'))).toContain('--remove-env-vars PUSH_QUEUE,PUSH_INVOKER_EMAIL');
    });

    it('refuses a service name that is not a staging one, so staging settings cannot land on production', async () => {
      writeFileSync(calls, '');
      const out = await run(['candidate'], { IRON_LOG_ENV: 'staging', SERVICE: 'iron-log' });
      expect(out.status).toBe(2);
      expect(recorded().some(l => l.includes('run deploy'))).toBe(false);
    });

    it('refuses an unknown environment', async () => {
      writeFileSync(calls, '');
      expect((await run(['candidate'], { IRON_LOG_ENV: 'dev' })).status).toBe(2);
    });

    it('production settings cannot be sent to a staging service either', async () => {
      writeFileSync(calls, '');
      const out = await run(['candidate'], { SERVICE: 'iron-log-staging' });
      expect(out.status).toBe(2);
      expect(out.stderr).toContain('IRON_LOG_ENV=staging');
      expect(recorded().some(l => l.includes('run deploy'))).toBe(false);
    });

    it('`secrets` refuses production\'s Google client for staging (ADR 057)', async () => {
      writeFileSync(calls, '');
      const out = await run(['secrets'], { IRON_LOG_ENV: 'staging', ...stagingDb, HAS_STAGING_PII_KEY: '1', SECRETS_READABLE: '1', PROD_CLIENT_ID: 'id' });
      expect(out.status).toBe(1);
      expect(out.stderr).toContain("production's");
      expect(recorded().some(l => l.includes('versions add'))).toBe(false);
    });

    it('`secrets` takes the staging login only, stores iron-log-staging-* names, makes staging its own key and lets the staging account read only that one', async () => {
      writeFileSync(calls, '');
      const wrongRole = await run(['secrets'], { IRON_LOG_ENV: 'staging', ...stagingDb, APP_DATABASE_URL: 'postgres://ironlog_app:pw@db.example.com/x', HAS_STAGING_PII_KEY: '1' });
      expect(wrongRole.status).toBe(1);
      expect(recorded().some(l => l.includes('versions add'))).toBe(false);
      writeFileSync(calls, '');
      const out = await run(['secrets'], { IRON_LOG_ENV: 'staging', ...stagingDb, STAGING_DB_EMPTIED: '1', RESEND_API_KEY: 'r', VAPID_SUBJECT: 'mailto:a@b.co' });
      expect(out.status).toBe(0);
      const lines = recorded();
      expect(lines.some(l => l.includes('secrets create iron-log-staging-app-database-url'))).toBe(true);
      expect(lines.some(l => l.includes('secrets create iron-log-staging-auth-secret'))).toBe(true);
      expect(lines.some(l => l.includes('secrets create iron-log-staging-pii-key'))).toBe(true);
      expect(lines.some(l => l.includes('versions add iron-log-staging-pii-key'))).toBe(true);
      expect(lines.some(l => /(secrets create|versions add|add-iam-policy-binding) iron-log-pii-key/.test(l))).toBe(false);
      expect(lines.some(l => l.includes('iron-log-resend') || l.includes('iron-log-vapid'))).toBe(false);
      expect(lines.some(l => l.includes('add-iam-policy-binding iron-log-staging-pii-key') && l.includes('iron-log-staging-run@p.iam.gserviceaccount.com'))).toBe(true);
      expect(lines.some(l => l.includes('iron-log-staging-') && l.includes('iron-log-run@p.iam.gserviceaccount.com'))).toBe(false);
    });

    it('`secrets` refuses staging when production\'s Google client id exists but cannot be read (fails closed)', async () => {
      writeFileSync(calls, '');
      const out = await run(['secrets'], { IRON_LOG_ENV: 'staging', ...stagingDb, HAS_STAGING_PII_KEY: '1', SECRETS_READABLE: '1', PROD_CLIENT_UNREADABLE: '1' });
      expect(out.status).toBe(1);
      expect(out.stderr).toContain('Cannot read iron-log-google-client-id');
      expect(recorded().some(l => l.includes('versions add'))).toBe(false);
    });

    it("`secrets` will not make staging's key until the owner says staging was emptied first", async () => {
      writeFileSync(calls, '');
      const out = await run(['secrets'], { IRON_LOG_ENV: 'staging', ...stagingDb });
      expect(out.status).toBe(1);
      expect(out.stderr).toContain('staging-db.mjs reset');
      expect(recorded().some(l => l.includes('iron-log-staging-pii-key') && (l.includes('secrets create') || l.includes('versions add')))).toBe(false);
    });

    it("`secrets` keeps staging's key once it exists (no new version, so sealed rows stay readable) and does not need production's", async () => {
      writeFileSync(calls, '');
      const out = await run(['secrets'], { IRON_LOG_ENV: 'staging', ...stagingDb, HAS_STAGING_PII_KEY: '1' });
      expect(out.status).toBe(0);
      expect(out.stdout).toContain('iron-log-staging-pii-key: kept');
      expect(recorded().some(l => l.includes('iron-log-staging-pii-key') && (l.includes('secrets create') || l.includes('versions add')))).toBe(false);
      expect(recorded().some(l => l.includes('iron-log-pii-key'))).toBe(false);
    });
  });

  // IRON_LOG_ENV=qa (ADR 060): the QA service has its own account, secrets and database key, and shares nothing with production or staging.
  describe('IRON_LOG_ENV=qa', () => {
    const secretsOf = (cmd: string) => /--set-secrets (\S+)/.exec(recorded().find(l => l.includes(cmd))!)![1]!.split(',');
    const qaDb = { APP_DATABASE_URL: 'postgres://ironlog_qa:pw@db.example.com/x', GOOGLE_CLIENT_ID: 'qa-id', GOOGLE_CLIENT_SECRET: 'gs' };

    it('deploys iron-log-qa as its own runtime account with iron-log-qa-* secrets and its own database key', async () => {
      writeFileSync(calls, '');
      const out = await run(['candidate'], { IRON_LOG_ENV: 'qa' });
      expect(out.status).toBe(0);
      const deploy = recorded().find(l => l.includes('run deploy'))!;
      expect(deploy).toContain('run deploy iron-log-qa ');
      expect(deploy).toContain('--service-account iron-log-qa-run@p.iam.gserviceaccount.com');
      expect(deploy).toContain('BASE_URL=https://iron-log-qa-123456.us-central1.run.app');
      const secrets = secretsOf('run deploy');
      expect(secrets).toContain('APP_DATABASE_URL=iron-log-qa-app-database-url:latest');
      expect(secrets).toContain('BETTER_AUTH_SECRET=iron-log-qa-auth-secret:latest');
      expect(secrets).toContain('GOOGLE_CLIENT_ID=iron-log-qa-google-client-id:latest');
      expect(secrets).toContain('PII_ENCRYPTION_KEY=iron-log-qa-pii-key:latest');
      expect(secrets.some(x => x.includes('iron-log-pii-key'))).toBe(false);
    });

    it('never passes the Resend or Web Push keys', async () => {
      writeFileSync(calls, '');
      expect((await run(['candidate'], { IRON_LOG_ENV: 'qa', SECRETS_READABLE: '1', PUSH_SECRET: '1', LIVE_RESEND: '1', LIVE_PUSH: '1' })).status).toBe(0);
      const secrets = secretsOf('run deploy');
      expect(secrets.some(x => x.startsWith('RESEND_API_KEY') || x.startsWith('VAPID_'))).toBe(false);
      expect(recorded().find(l => l.includes('run deploy'))).toContain('--remove-env-vars PUSH_QUEUE,PUSH_INVOKER_EMAIL');
    });

    it('keeps the three services apart: each refuses the others\' service names', async () => {
      const wrong: Record<string, string>[] = [{ IRON_LOG_ENV: 'qa', SERVICE: 'iron-log' }, { IRON_LOG_ENV: 'qa', SERVICE: 'iron-log-staging' }, { SERVICE: 'iron-log-qa' }, { IRON_LOG_ENV: 'staging', SERVICE: 'iron-log-qa' }];
      for (const env of wrong) {
        writeFileSync(calls, '');
        expect((await run(['candidate'], env)).status, JSON.stringify(env)).toBe(2);
        expect(recorded().some(l => l.includes('run deploy'))).toBe(false);
      }
    });

    it('`secrets` takes the QA login only, stores iron-log-qa-* names, makes QA\'s own key once, and touches no other environment\'s secrets', async () => {
      writeFileSync(calls, '');
      const wrongRole = await run(['secrets'], { IRON_LOG_ENV: 'qa', ...qaDb, APP_DATABASE_URL: 'postgres://ironlog_staging:pw@db.example.com/x' });
      expect(wrongRole.status).toBe(1);
      expect(recorded().some(l => l.includes('versions add'))).toBe(false);
      writeFileSync(calls, '');
      const first = await run(['secrets'], { IRON_LOG_ENV: 'qa', ...qaDb, RESEND_API_KEY: 'r', VAPID_SUBJECT: 'mailto:a@b.co' });
      expect(first.status).toBe(0);
      let lines = recorded();
      expect(lines.some(l => l.includes('secrets create iron-log-qa-app-database-url'))).toBe(true);
      expect(lines.some(l => l.includes('secrets create iron-log-qa-pii-key'))).toBe(true);
      expect(lines.some(l => l.includes('versions add iron-log-qa-pii-key'))).toBe(true);
      expect(lines.some(l => l.includes('iron-log-resend') || l.includes('iron-log-vapid'))).toBe(false);
      expect(lines.some(l => l.includes('add-iam-policy-binding iron-log-qa-pii-key') && l.includes('iron-log-qa-run@p.iam.gserviceaccount.com'))).toBe(true);
      expect(lines.some(l => (l.includes('iron-log-run@') || l.includes('iron-log-staging-run@')) && l.includes('add-iam-policy-binding'))).toBe(false);
      expect(lines.some(l => l.includes(' iron-log-pii-key') && !l.includes('iron-log-qa'))).toBe(false);
      writeFileSync(calls, '');
      expect((await run(['secrets'], { IRON_LOG_ENV: 'qa', ...qaDb, HAS_QA_PII_KEY: '1' })).stdout).toContain('iron-log-qa-pii-key: kept');
      lines = recorded();
      expect(lines.some(l => l.includes('versions add iron-log-qa-pii-key'))).toBe(false);
    });

    it('`secrets` refuses the production or the staging Google client, and fails closed when one cannot be read', async () => {
      const env = { IRON_LOG_ENV: 'qa', ...qaDb, SECRETS_READABLE: '1', PROD_CLIENT_ID: 'prod-id', STAGING_CLIENT_ID: 'stg-id' };
      writeFileSync(calls, '');
      const asProd = await run(['secrets'], { ...env, GOOGLE_CLIENT_ID: 'prod-id' });
      expect(asProd.status).toBe(1);
      expect(asProd.stderr).toContain("production's");
      writeFileSync(calls, '');
      const asStaging = await run(['secrets'], { ...env, GOOGLE_CLIENT_ID: 'stg-id' });
      expect(asStaging.status).toBe(1);
      expect(asStaging.stderr).toContain("staging's");
      writeFileSync(calls, '');
      const unreadable = await run(['secrets'], { ...env, PROD_CLIENT_UNREADABLE: '1' });
      expect(unreadable.status).toBe(1);
      expect(unreadable.stderr).toContain('Cannot read iron-log-google-client-id');
      expect(recorded().some(l => l.includes('versions add'))).toBe(false);
    });
  });

  it('discard and restore make the single call each is named for', async () => {
    writeFileSync(calls, '');
    await run(['discard']);
    await run(['restore']);
    const traffic = recorded().filter(l => l.includes('update-traffic'));
    expect(traffic[0]).toContain('--remove-tags candidate');
    expect(traffic[1]).toContain('--to-latest');
  });

  it('refuses to build from a dirty working tree', async () => {
    writeFileSync(join(dir, 'dirty.txt'), 'x');
    const out = await run(['candidate']);
    expect(out.status).not.toBe(0);
    expect(out.stderr).toContain('uncommitted changes');
    rmSync(join(dir, 'dirty.txt'));
  });
});
