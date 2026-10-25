import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '../test/browserStubs.js';
import { mem } from '../test/browserStubs.js';
import { notifySupported, restNotifyOn, setRestNotify, showRestNotice, clearRestNotice } from './restNotify.ts';

const saved = {};
const put = (k, v) => { if (!(k in saved)) saved[k] = Object.getOwnPropertyDescriptor(globalThis, k); Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); };
const restore = () => { for (const k of Object.keys(saved)) { if (saved[k]) Object.defineProperty(globalThis, k, saved[k]); else delete globalThis[k]; delete saved[k]; } };
const showNotification = vi.fn(), close = vi.fn();
const setup = (permission, ask = 'denied') => {
  const N = vi.fn(); N.permission = permission; N.requestPermission = vi.fn(async () => { N.permission = ask; return ask; });
  put('Notification', N);
  put('navigator', { serviceWorker: { getRegistration: async () => ({ showNotification, getNotifications: async () => [{ close }] }) } });
  return N;
};
beforeEach(() => { for (const k of Object.keys(mem)) delete mem[k]; });
afterEach(() => { restore(); vi.clearAllMocks(); });

describe('rest notification opt-in', () => {
  it('is unsupported without Notification or a service worker', async () => {
    put('Notification', undefined);
    expect(notifySupported()).toBe(false);
    expect(await setRestNotify(true)).toBe('unsupported');
    expect(restNotifyOn()).toBe(false);
  });
  it('asks the browser once, and is on only when it says yes', async () => {
    const N = setup('default', 'granted');
    expect(restNotifyOn()).toBe(false);
    expect(await setRestNotify(true)).toBe('on');
    expect(N.requestPermission).toHaveBeenCalledTimes(1);
    expect(restNotifyOn()).toBe(true);
  });
  it('stays off when the browser says no', async () => {
    setup('default', 'denied');
    expect(await setRestNotify(true)).toBe('denied');
    expect(restNotifyOn()).toBe(false);
  });
  it('does not ask again when permission is already granted, and turns off from the setting alone', async () => {
    const N = setup('granted');
    expect(await setRestNotify(true)).toBe('on');
    expect(N.requestPermission).not.toHaveBeenCalled();
    expect(await setRestNotify(false)).toBe('off');
    expect(restNotifyOn()).toBe(false);
  });
  it('is off if the person later blocks notifications in the browser', async () => {
    setup('granted'); await setRestNotify(true);
    setup('denied');
    expect(restNotifyOn()).toBe(false);
  });
});

describe('showing and clearing the notice', () => {
  it('shows it through the service worker under one tag', async () => {
    setup('granted');
    await showRestNotice('Rest over.');
    expect(showNotification).toHaveBeenCalledWith('Loadbearer', expect.objectContaining({ body: 'Rest over.', tag: 'rest-timer' }));
  });
  it('takes it down when asked', async () => {
    setup('granted');
    await clearRestNotice();
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('never throws when the browser refuses', async () => {
    setup('granted');
    showNotification.mockRejectedValueOnce(new Error('no'));
    await expect(showRestNotice('x')).resolves.toBeUndefined();
  });
});
