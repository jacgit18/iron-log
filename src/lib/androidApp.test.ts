import { describe, it, expect } from 'vitest';
import { inAndroidApp } from './androidApp.js';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };

describe('inAndroidApp', () => {
  it('is true when the page was opened by the Android app', () => expect(inAndroidApp('android-app://app.loadbearer', memory())).toBe(true));
  it('is false in a normal browser tab', () => expect(inAndroidApp('https://www.google.com/', memory())).toBe(false));
  it('is false with no referrer', () => expect(inAndroidApp('', memory())).toBe(false));
  it('remembers it for the rest of the session, when the referrer is gone', () => {
    const store = memory();
    inAndroidApp('android-app://app.loadbearer', store);
    expect(inAndroidApp('', store)).toBe(true);
    expect(inAndroidApp('https://loadbearer.app/', store)).toBe(true);
  });
  it('does not carry over to a session that never saw the app referrer', () => expect(inAndroidApp('', memory())).toBe(false));
  it('still answers from the referrer when storage is blocked', () => {
    expect(inAndroidApp('android-app://app.loadbearer', blocked)).toBe(true);
    expect(inAndroidApp('', blocked)).toBe(false);
  });
});
