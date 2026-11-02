import { afterEach, describe, expect, it, vi } from 'vitest';

// qaLink.ts reads the address when it first loads, so each case sets a fake location and imports a fresh copy.
async function load(search: string, hash = '') {
  const replaced: string[] = [];
  vi.stubGlobal('location', { search, pathname: '/', hash });
  vi.stubGlobal('history', { replaceState: (_s: unknown, _t: string, url: string) => { replaced.push(url); } });
  vi.resetModules();
  return { mod: await import('./qaLink.js'), replaced };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('the /?qa= link, read once', () => {
  it('holds a valid account id, hands it out once, and cleans the address', async () => {
    const { mod, replaced } = await load('?qa=meal-planner', '#/daily');
    expect(replaced).toEqual(['/#/daily']);
    expect(mod.hasHeldQaLink()).toBe(true);
    expect(mod.takeQaLink()).toBe('meal-planner');
    expect(mod.takeQaLink()).toBeNull();
    expect(mod.hasHeldQaLink()).toBe(false);
  });
  it('removes the parameter even when the value is refused, and keeps other parameters', async () => {
    const bad = await load('?qa=%3Cscript%3E');
    expect(bad.replaced).toEqual(['/']);
    expect(bad.mod.takeQaLink()).toBeNull();
    const other = await load('?open=daily&qa=diet-fresh');
    expect(other.replaced).toEqual(['/?open=daily']);
    expect(other.mod.takeQaLink()).toBe('diet-fresh');
  });
  it('does nothing without the parameter', async () => {
    const { mod, replaced } = await load('?open=daily');
    expect(replaced).toEqual([]);
    expect(mod.hasHeldQaLink()).toBe(false);
  });
});
