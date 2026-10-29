import { describe, expect, it, vi } from 'vitest';
import { GROUPS, jumpToGroup } from './settingsGroups.js';

describe('jumpToGroup', () => {
  it('focuses then scrolls the heading, smooth only when motion is allowed', async () => {
    const calls: string[] = [];
    const h = { focus: () => calls.push('focus'), scrollIntoView: (o: { behavior: string }) => calls.push(`scroll:${o.behavior}`) };
    expect(await jumpToGroup('data', { find: id => (id === 'set-data-h' ? h : null), raf: cb => cb(), smooth: true })).toBe(true);
    expect(calls).toEqual(['focus', 'scroll:smooth']);
    calls.length = 0;
    await jumpToGroup('data', { find: () => h, raf: cb => cb(), smooth: false });
    expect(calls).toEqual(['focus', 'scroll:instant']);
  });

  it('waits for a heading that is drawn a few frames later (coming from another tab)', async () => {
    let frames = 0;
    const h = { focus: vi.fn(), scrollIntoView: vi.fn() };
    const ok = await jumpToGroup('app', { find: () => (frames >= 3 ? h : null), raf: cb => { frames++; cb(); }, smooth: false });
    expect(ok).toBe(true);
    expect(h.scrollIntoView).toHaveBeenCalledOnce();
  });

  it('gives up after the allowed tries', async () => {
    const raf = vi.fn((cb: () => void) => cb());
    expect(await jumpToGroup('erase', { find: () => null, raf, smooth: false, tries: 5 })).toBe(false);
    expect(raf).toHaveBeenCalledTimes(5);
  });

  it('lists the four groups in page order', () => {
    expect(GROUPS.map(([id]) => id)).toEqual(['training', 'data', 'app', 'erase']);
  });
});
