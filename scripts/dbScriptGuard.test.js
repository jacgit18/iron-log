import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectHost, guardHost } from './lib/db-script.mjs';

// Code review R-01 of the QA and staging database scripts: guardHost must refuse production's database however its URL is spelled. The old check compared
// `new URL(url).hostname`, which for a postgres: URL keeps the case and any percent-escapes and ignores a ?host= parameter that the pg driver lets replace the host,
// so each of the forms below passed the guard and then connected to production (qa-db.mjs reset --apply empties user data; staging-db.mjs clear --apply signs everyone out).

const PROD_HOST = 'ep-cool-123.us-east-2.aws.neon.tech';
const PROD = `postgres://owner:pw@${PROD_HOST}/neondb`;
const OTHER = 'ep-other-9.us-east-2.aws.neon.tech';

// What the script's --host argument would be when the URL is honest.
const refused = (url, host = connectHost(url) || 'x') => {
  try { guardHost(url, host, 'QA_DATABASE_URL'); return false; } catch (e) { return e.message.startsWith('exit'); }
};

let saved;
beforeEach(() => {
  saved = process.env.PROD_DATABASE_URL;
  process.env.PROD_DATABASE_URL = PROD;
  vi.spyOn(process, 'exit').mockImplementation(code => { throw new Error(`exit ${code}`); });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  if (saved === undefined) delete process.env.PROD_DATABASE_URL; else process.env.PROD_DATABASE_URL = saved;
});

describe('connectHost', () => {
  it('is the host the pg driver connects to, in one spelling', () => {
    expect(connectHost(`postgres://o:p@${PROD_HOST}/neondb`)).toBe(PROD_HOST);
    expect(connectHost(`postgres://o:p@${PROD_HOST.toUpperCase()}/neondb`)).toBe(PROD_HOST);
    expect(connectHost(`postgres://o:p@${PROD_HOST}./neondb`)).toBe(PROD_HOST);
    expect(connectHost(`postgres://o:p@${PROD_HOST.replace('-', '%2D')}/neondb`)).toBe(PROD_HOST);
    expect(connectHost(`postgres://o:p@${OTHER}/neondb?host=${PROD_HOST}`)).toBe(PROD_HOST); // the ?host= parameter wins in pg, so it wins here
  });
});

describe('guardHost refuses production, however the URL is spelled', () => {
  it.each([
    ['the same host', `postgres://o:p@${PROD_HOST}/neondb`],
    ['the pooled form', 'postgres://o:p@ep-cool-123-pooler.us-east-2.aws.neon.tech/neondb'],
    ['an explicit port', `postgres://o:p@${PROD_HOST}:5432/neondb`],
    ['upper case', `postgres://o:p@${PROD_HOST.toUpperCase()}/neondb`],
    ['an upper case pooled host', 'postgres://o:p@EP-COOL-123-POOLER.US-EAST-2.AWS.NEON.TECH/neondb'],
    ['a trailing dot', `postgres://o:p@${PROD_HOST}./neondb`],
    ['a percent-escaped hyphen', `postgres://o:p@${PROD_HOST.replace('-', '%2D')}/neondb`],
    ['a ?host= parameter on another host', `postgres://o:p@${OTHER}/neondb?host=${PROD_HOST}`],
    ['production in the userinfo and another host after it', `postgres://${PROD_HOST}@${OTHER}/neondb?host=${PROD_HOST}`],
  ])('%s', (_name, url) => {
    expect(refused(url)).toBe(true);
  });

  it('also refuses when the typed --host matches production in a different case', () => {
    expect(refused(PROD, PROD_HOST.toUpperCase())).toBe(true);
  });

  it('refuses a host that does not match the typed --host (a typo), even when it is not production', () => {
    expect(refused(`postgres://o:p@${OTHER}/neondb`, 'ep-another-1.us-east-2.aws.neon.tech')).toBe(true);
  });

  it('refuses a URL with no host the driver can read (a socket path)', () => {
    expect(refused('postgres://o:p@%2Fvar%2Frun%2Fpostgresql/neondb', 'x')).toBe(true);
  });

  it('refuses when production cannot be told (nothing set to compare with)', () => {
    delete process.env.PROD_DATABASE_URL;
    expect(refused(`postgres://o:p@${OTHER}/neondb`)).toBe(true);
  });
});

describe('guardHost lets another database through', () => {
  it.each([
    ['its own host', `postgres://o:p@${OTHER}/neondb`],
    ['an upper case spelling of its own host', `postgres://o:p@${OTHER.toUpperCase()}/neondb`],
    ['its pooled form', 'postgres://o:p@ep-other-9-pooler.us-east-2.aws.neon.tech/neondb'],
    ['a ?host= parameter that names itself', `postgres://o:p@${OTHER}/neondb?host=${OTHER}`],
  ])('%s', (_name, url) => {
    expect(refused(url)).toBe(false);
  });
});
