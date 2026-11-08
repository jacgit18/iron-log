import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { GUIDE_STEPS, dismissProgramGuide, programGuideDismissed } from './programGuide.js';
import { MONEY_WORDS } from './programOnComputer.js';

describe('program guide', () => {
  const store: Record<string, string> = {};
  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } });
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  it('shows until "Got it", then stays hidden on this device', () => {
    expect(programGuideDismissed()).toBe(false);
    dismissProgramGuide();
    expect(programGuideDismissed()).toBe(true);
  });
  it('has four steps, the last one about a computer, with no price or plan word', () => {
    expect(GUIDE_STEPS).toHaveLength(4);
    expect(GUIDE_STEPS[3].title).toContain('computer');
    for (const s of GUIDE_STEPS) expect(MONEY_WORDS.test(`${s.title} ${s.text}`), s.title).toBe(false);
  });
});
