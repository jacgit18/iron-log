import { afterEach, describe, expect, it, vi } from 'vitest';

// The QA smoke run creates and signs in as test accounts (the QA-mode one also marks the database as QA's and deletes accounts), so each config must refuse
// any database that is not on this machine (brief: qa-nightly-smoke).
describe.each([['playwright.qa.config.js'], ['playwright.qaMode.config.js']])('%s', file => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
  const load = async (db, appDb = db) => {
    vi.resetModules();
    vi.stubEnv('E2E_DATABASE_URL', db);
    vi.stubEnv('E2E_APP_DATABASE_URL', appDb);
    return import(`../${file}`);
  };
  it('refuses a database host that is not local', async () => {
    await expect(load('postgres://u:p@db.example.com:5432/x')).rejects.toThrow(/Refusing to run the account tests against db\.example\.com/);
    await expect(load('postgres://u:p@127.0.0.1:5432/x', 'postgres://u:p@10.0.0.5:5432/x')).rejects.toThrow(/10\.0\.0\.5/);
  });
  it('accepts a local one', async () => {
    const mod = await load('postgres://u:p@127.0.0.1:5432/x');
    expect(mod.default.testDir).toBe('e2e-qa');
    expect(mod.default.use.baseURL).toMatch(/^http:\/\/127\.0\.0\.1:/);
  });
  it('refuses to start with no database set', async () => {
    vi.stubEnv('E2E_DATABASE_URL', '');
    vi.stubEnv('E2E_APP_DATABASE_URL', '');
    vi.resetModules();
    await expect(import(`../${file}`)).rejects.toThrow(/not set/);
  });
});
