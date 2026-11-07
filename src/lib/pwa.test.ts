import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { install, isIOS, keepData, usePwa, type InstallEvent } from './pwa.js';

const reset = () => usePwa.setState({ installEvent: null, installed: false, persisted: null });
beforeEach(reset);
afterEach(() => { vi.unstubAllGlobals(); });

describe('isIOS', () => {
  it('is true for an iPhone and for an iPad that reports as a Mac with a touch screen', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 });
    expect(isIOS()).toBe(true);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 });
    expect(isIOS()).toBe(true);
  });
  it('is false for a desktop Mac and for Android', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 });
    expect(isIOS()).toBe(false);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux armv81', maxTouchPoints: 5 });
    expect(isIOS()).toBe(false);
  });
});

describe('install', () => {
  const event = (outcome: 'accepted' | 'dismissed') => ({ prompt: vi.fn().mockResolvedValue(undefined), userChoice: Promise.resolve({ outcome }) }) as unknown as InstallEvent;
  it('does nothing without a deferred install prompt', async () => {
    await install();
    expect(usePwa.getState()).toMatchObject({ installEvent: null, installed: false });
  });
  it('marks the app installed when the prompt is accepted, and uses the prompt up either way', async () => {
    const e = event('accepted'); usePwa.setState({ installEvent: e });
    await install();
    expect(e.prompt).toHaveBeenCalled();
    expect(usePwa.getState()).toMatchObject({ installEvent: null, installed: true });
    reset(); usePwa.setState({ installEvent: event('dismissed') });
    await install();
    expect(usePwa.getState()).toMatchObject({ installEvent: null, installed: false });
  });
});

describe('keepData', () => {
  it('says nothing when the browser cannot persist storage', async () => {
    vi.stubGlobal('navigator', {});
    expect(await keepData()).toBeNull();
    expect(usePwa.getState().persisted).toBeNull();
  });
  it('records whether the browser granted it, and treats a refusal that throws as not granted', async () => {
    vi.stubGlobal('navigator', { storage: { persist: () => Promise.resolve(true) } });
    expect(await keepData()).toBe(true);
    expect(usePwa.getState().persisted).toBe(true);
    vi.stubGlobal('navigator', { storage: { persist: () => Promise.reject(new Error('blocked')) } });
    expect(await keepData()).toBe(false);
  });
});
