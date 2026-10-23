// The secrets check of the parity job (secrets-and-keys-hygiene brief, item 3): which secret NAMES exist in Secret Manager, compared with the
// inventory (scripts/secret-inventory.mjs). Names only: this never reads a secret value, and the job's account holds a metadata-only role
// (roles/secretmanager.viewer), which cannot read one. Pure comparison plus a small lister that talks to the Secret Manager API with the job's
// own token from the metadata server (no new dependency).
import { INVENTORY, PREFIXES, inventoryNames } from '../secret-inventory.mjs';

/** The secrets the inventory says should exist in Secret Manager: [{ name, envs: [...], optional, group, trigger }], one per concrete name. */
export function expectedSecrets() {
  const byName = new Map();
  for (const e of INVENTORY) {
    if (e.where !== 'SM') continue;
    for (const env of e.envs) {
      const name = e.name.replace('{p}', PREFIXES[env]).replace('{e}', env);
      const at = byName.get(name) ?? { name, envs: [], optional: !!e.optional, group: typeof e.optional === 'string' ? e.optional : null, trigger: !!e.trigger, entry: e.name };
      at.envs.push(env);
      byName.set(name, at);
    }
  }
  return [...byName.values()];
}

/**
 * Compare the names present with the inventory. Codes follow the parity report: 0 OK; 3 UNLISTED (a secret named iron-log-* that the inventory
 * does not know: yellow, add it to the inventory or delete it); 4 MISSING (a required secret is absent: red, a deploy would break);
 * MISSING wins. `mixed` is information only (it looks at each group's trigger): an optional feature that is set in some environments and not in others (Stripe in production
 * but not staging, say), which can be on purpose.
 */
export function checkSecretNames(present, expected = expectedSecrets(), known = inventoryNames()) {
  const have = new Set(present);
  // A group deploy treats as one (Stripe: four secrets; Web Push: three): deploy checks only the trigger, then maps all of them, so once the trigger
  // exists in an environment the rest of its group is required there.
  const on = new Set(expected.filter(x => x.group && x.trigger && have.has(x.name)).flatMap(x => x.envs.map(e => `${x.group}:${e}`)));
  const required = x => !x.optional || (x.group && x.envs.some(e => on.has(`${x.group}:${e}`)));
  const missing = expected.filter(x => required(x) && !have.has(x.name)).map(x => x.name).sort();
  const unlisted = [...have].filter(n => n.startsWith('iron-log') && !known.has(n)).sort();
  // Optional entries that share a pattern across environments ({p}-stripe-secret-key): present somewhere, absent elsewhere.
  const groups = new Map();
  for (const x of expected.filter(x => x.optional && x.entry.includes('{p}') && (!x.group || x.trigger))) {
    const g = groups.get(x.entry) ?? { yes: [], no: [] };
    (have.has(x.name) ? g.yes : g.no).push(x.envs[0]);
    groups.set(x.entry, g);
  }
  const mixed = [...groups].filter(([, g]) => g.yes.length && g.no.length).map(([entry, g]) => ({ entry, set: g.yes, notSet: g.no }));
  const code = missing.length ? 4 : unlisted.length ? 3 : 0;
  return { code, missing, unlisted, mixed, checked: expected.filter(required).length };
}

/** One summary line, no values. */
export function describe(r) {
  const parts = [];
  if (r.missing.length) parts.push(`MISSING ${r.missing.length} (${r.missing.join(', ')})`);
  if (r.unlisted.length) parts.push(`UNLISTED ${r.unlisted.length} (${r.unlisted.join(', ')}; add to scripts/secret-inventory.mjs or delete)`);
  if (!parts.length) parts.push(`OK (${r.checked} expected secrets exist)`);
  const mixed = r.mixed.length ? `; optional features set in some environments only: ${r.mixed.map(m => `${m.entry} (set: ${m.set.join(', ')}; not set: ${m.notSet.join(', ')})`).join('; ')}` : '';
  return `secrets: ${parts.join('; ')}${mixed}`;
}

const META = 'http://metadata.google.internal/computeMetadata/v1';
/** The names of every secret in the project, through the Secret Manager API as the job's own account. Throws with the HTTP status, never a body. */
export async function listSecretNames({ fetchFn = fetch, timeoutMs = Number(process.env.PARITY_METADATA_TIMEOUT_MS ?? 5_000), project = process.env.PARITY_PROJECT_ID } = {}) {
  const signal = () => AbortSignal.timeout(timeoutMs);
  const meta = async path => {
    const r = await fetchFn(`${META}/${path}`, { headers: { 'Metadata-Flavor': 'Google' }, signal: signal() });
    if (!r.ok) throw new Error(`the metadata server answered ${r.status}`);
    return r;
  };
  const id = project || (await (await meta('project/project-id')).text()).trim();
  const token = (await (await meta('instance/service-accounts/default/token')).json()).access_token;
  if (!token) throw new Error('no access token from the metadata server');
  const names = [];
  let page = '';
  for (let i = 0; i < 20; i++) { // 20 pages of 250 is far more secrets than this project will ever hold
    const r = await fetchFn(`https://secretmanager.googleapis.com/v1/projects/${encodeURIComponent(id)}/secrets?pageSize=250${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`, { headers: { Authorization: `Bearer ${token}` }, signal: signal() });
    if (!r.ok) throw new Error(`Secret Manager answered ${r.status}`);
    const body = await r.json();
    for (const s of body.secrets ?? []) names.push(String(s.name).split('/').pop());
    if (!body.nextPageToken) return names;
    page = body.nextPageToken;
  }
  throw new Error('too many pages of secrets');
}
