import { describe, expect, it } from 'vitest';
import { adminsFrom, isAdmin, requireAdmin } from './admin.ts';

describe('adminsFrom', () => {
  it('splits, trims and lowercases; unset is nobody', () => {
    expect([...adminsFrom(' A@x.com, dev:Owner ,,')]).toEqual(['a@x.com', 'dev:owner']);
    expect(adminsFrom(undefined).size).toBe(0);
    expect(adminsFrom('').size).toBe(0);
  });
});

describe('isAdmin', () => {
  const admins = adminsFrom('me@x.com,dev:owner');
  it('matches a verified session email in any case', () => {
    expect(isAdmin({ kind: 'session', email: 'ME@x.com', name: 'Me' }, admins)).toBe(true);
    expect(isAdmin({ kind: 'session', email: 'other@x.com', name: null }, admins)).toBe(false);
  });
  it('never trusts an unverified email', () => {
    expect(isAdmin({ kind: 'session', email: 'me@x.com', name: null }, admins, false)).toBe(false);
  });
  it('matches a development user as dev:<name>, and a dev user is not matched by email', () => {
    expect(isAdmin({ kind: 'dev', email: null, name: 'dev:owner' }, admins)).toBe(true);
    expect(isAdmin({ kind: 'dev', email: null, name: 'dev:guest' }, admins)).toBe(false);
    expect(isAdmin({ kind: 'dev', email: 'me@x.com', name: 'dev:guest' }, admins)).toBe(false);
  });
  it('an empty list admits nobody', () => {
    expect(isAdmin({ kind: 'session', email: 'me@x.com', name: null }, adminsFrom(undefined))).toBe(false);
  });
});

describe('requireAdmin', () => {
  const run = (account: unknown) => {
    let status = 0, called = false;
    const res = { locals: { account }, status(n: number) { status = n; return this; }, json() { return this; } };
    requireAdmin({} as never, res as never, () => { called = true; });
    return { status, called };
  };
  it('lets an admin through and answers 403 to anyone else', () => {
    expect(run({ isAdmin: true })).toEqual({ status: 0, called: true });
    expect(run({ isAdmin: false })).toEqual({ status: 403, called: false });
    expect(run(undefined)).toEqual({ status: 403, called: false });
  });
});
