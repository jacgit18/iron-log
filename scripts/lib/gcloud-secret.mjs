// Reads one Secret Manager value for the qa-*-secrets.mjs scripts. The project is pinned here (gcloud's own default project can be a different one).
import { spawnSync } from 'node:child_process';

export const PROJECT = process.env.GCP_PROJECT_ID || 'iron-log-jacgit18';

const die = msg => { console.error(msg); process.exit(1); };

// The value of a secret, never printed: only its name appears in a message.
export function secret(name) {
  const r = spawnSync('gcloud', ['secrets', 'versions', 'access', 'latest', `--secret=${name}`, `--project=${PROJECT}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.error) die(`Could not run gcloud (${r.error.code ?? r.error.message}). Install it and run: gcloud auth login`);
  const value = (r.stdout ?? '').trim();
  if (r.status !== 0 || !value) {
    const said = r.status !== 0 ? (r.stderr ?? '').split('\n').find(l => l.trim()) : ''; // gcloud's own reason, shown only when it failed (so no value was returned)
    die(`Could not read the secret ${name} in project ${PROJECT}.${said ? ` gcloud said: ${said.trim().slice(0, 200)}` : ''} Run: gcloud auth login (as someone who can read it).`);
  }
  return value;
}
