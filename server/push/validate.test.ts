import { describe, expect, it } from 'vitest';
import { pushConfigFrom } from './config.ts';
import { MAX_AHEAD_MS, parseCancel, parseEndpoint, parseSchedule, parseSubscription, parseUnsubscribe } from './validate.ts';

const NOW = 1_800_000_000_000;
const endpoint = 'https://fcm.googleapis.com/fcm/send/abc';
const good = { endpoint, kind: 'rest', key: '1800000000000', at: NOW + 90_000, body: 'Rest over. Time for your next set.' };

describe('parseEndpoint', () => {
  it('takes https only, and not an empty, long or odd value', () => {
    expect(parseEndpoint(endpoint)).toBe(endpoint);
    for (const v of ['http://x.example/a', 'ftp://x', 'https://', '', 5, null, undefined, `https://x.example/${'a'.repeat(2100)}`]) expect(parseEndpoint(v)).toBeNull();
  });
});

describe('parseSubscription', () => {
  it("reads a browser's PushSubscription.toJSON()", () => {
    expect(parseSubscription({ endpoint, expirationTime: null, keys: { p256dh: 'k', auth: 'a' } })).toEqual({ endpoint, p256dh: 'k', auth: 'a' });
  });
  it.each([null, 'x', [], {}, { endpoint }, { endpoint, keys: {} }, { endpoint, keys: { p256dh: 'k' } }, { endpoint: 'http://x', keys: { p256dh: 'k', auth: 'a' } }, { endpoint, keys: { p256dh: 'k'.repeat(300), auth: 'a' } }])('refuses %j', v => {
    expect(parseSubscription(v)).toBeNull();
  });
});

describe('parseUnsubscribe', () => {
  it('needs an https endpoint', () => {
    expect(parseUnsubscribe({ endpoint })).toEqual({ endpoint });
    expect(parseUnsubscribe({})).toBeNull();
  });
});

describe('parseSchedule', () => {
  it('accepts a rest and a day-nudge job', () => {
    expect(parseSchedule(good, NOW)).toEqual({ endpoint, kind: 'rest', key: '1800000000000', at: NOW + 90_000, text: good.body });
    expect(parseSchedule({ ...good, kind: 'day-nudge', key: 'n' }, NOW)?.kind).toBe('day-nudge');
  });
  it('refuses a time too far ahead, long past, or not a number', () => {
    expect(parseSchedule({ ...good, at: NOW + MAX_AHEAD_MS }, NOW)).not.toBeNull();
    for (const at of [NOW + MAX_AHEAD_MS + 1, NOW - 6_000, NaN, Infinity, '1800000000000', null]) expect(parseSchedule({ ...good, at }, NOW)).toBeNull();
  });
  it('allows a few seconds of clock difference into the past', () => {
    expect(parseSchedule({ ...good, at: NOW - 4_000 }, NOW)).not.toBeNull();
  });
  it('refuses an unknown kind, a missing key, an empty, long or control-character body', () => {
    for (const bad of [{ kind: 'marketing' }, { kind: undefined }, { key: '' }, { key: 'k'.repeat(41) }, { body: '' }, { body: 'x'.repeat(141) }, { body: 'a\nb' }, { endpoint: 'http://x' }]) {
      expect(parseSchedule({ ...good, ...bad }, NOW), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('parseCancel', () => {
  it('takes a kind with or without a key', () => {
    expect(parseCancel({ endpoint, kind: 'rest' })).toEqual({ endpoint, kind: 'rest' });
    expect(parseCancel({ endpoint, kind: 'rest', key: 'k' })).toEqual({ endpoint, kind: 'rest', key: 'k' });
  });
  it('refuses a bad kind or a key that is present but empty', () => {
    expect(parseCancel({ endpoint, kind: 'x' })).toBeNull();
    expect(parseCancel({ endpoint, kind: 'rest', key: '' })).toBeNull();
    expect(parseCancel({ kind: 'rest' })).toBeNull();
  });
});

describe('pushConfigFrom', () => {
  const pub = 'B'.repeat(87);
  const priv = 'p'.repeat(43);
  it('is off, with a reason, when nothing is set', () => {
    expect(pushConfigFrom({})).toEqual({ reason: expect.stringContaining('not set') });
  });
  it('is on with a valid trio', () => {
    expect(pushConfigFrom({ VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv, VAPID_SUBJECT: 'mailto:me@example.com' }).config).toEqual({ publicKey: pub, privateKey: priv, subject: 'mailto:me@example.com' });
    expect(pushConfigFrom({ VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv, VAPID_SUBJECT: 'https://example.com/contact' }).config).toBeDefined();
  });
  it('stays off and says which setting is wrong when one is partial or malformed', () => {
    expect(pushConfigFrom({ VAPID_PUBLIC_KEY: pub }).reason).toMatch(/PRIVATE/);
    expect(pushConfigFrom({ VAPID_PUBLIC_KEY: 'short', VAPID_PRIVATE_KEY: priv, VAPID_SUBJECT: 'mailto:a@b.c' }).reason).toMatch(/PUBLIC/);
    expect(pushConfigFrom({ VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv, VAPID_SUBJECT: 'me@example.com' }).reason).toMatch(/SUBJECT/);
  });
});
