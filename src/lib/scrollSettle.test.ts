import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scrollWhenSettled } from './scrollSettle.js';

// A stand-in window: listeners are kept so a test can fire a "reader moved" event; timers and frames are the fake ones.
const listeners = new Map<string, Set<() => void>>();
const fire = (e: string) => listeners.get(e)?.forEach(f => f());
beforeEach(() => {
  vi.useFakeTimers(); listeners.clear();
  vi.stubGlobal('requestAnimationFrame', (f: () => void) => setTimeout(f, 16));
  vi.stubGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
  vi.stubGlobal('window', {
    addEventListener: (e: string, f: () => void) => { (listeners.get(e) ?? listeners.set(e, new Set()).get(e)!).add(f); },
    removeEventListener: (e: string, f: () => void) => { listeners.get(e)?.delete(f); },
    setTimeout,
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('scrollWhenSettled', () => {
  it('goes on the next frame and again after 700 ms', () => {
    const go = vi.fn(); scrollWhenSettled(go);
    vi.advanceTimersByTime(20); expect(go).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(700); expect(go).toHaveBeenCalledTimes(2);
  });
  it.each(['wheel', 'touchstart', 'keydown', 'pointerdown'])('does not go again once the reader moved (%s)', e => {
    const go = vi.fn(); scrollWhenSettled(go);
    vi.advanceTimersByTime(20); fire(e); vi.advanceTimersByTime(700);
    expect(go).toHaveBeenCalledTimes(1);
  });
  it('leaves no listener behind after it ends or is cancelled', () => {
    scrollWhenSettled(vi.fn()); vi.advanceTimersByTime(800);
    expect([...listeners.values()].every(s => s.size === 0)).toBe(true);
    const cancel = scrollWhenSettled(vi.fn()); cancel();
    expect([...listeners.values()].every(s => s.size === 0)).toBe(true);
  });
  it('cancel stops both runs', () => {
    const go = vi.fn(); scrollWhenSettled(go)(); vi.advanceTimersByTime(1000);
    expect(go).not.toHaveBeenCalled();
  });
});
