import { describe, expect, it } from 'vitest';
import { PROGRESS_PAGES, parseRoute } from './route.js';
import { SECTIONS, currentSection, hasProgressData, pathOfSection, sectionOfPage } from './progressPage.js';

describe('Progress one page', () => {
  it('has a section for every Progress address, and each address round-trips', () => {
    for (const p of PROGRESS_PAGES) {
      const id = sectionOfPage(p);
      expect(id, p).not.toBeNull();
      expect(pathOfSection(id!)).toBe(`progress/${p}`);
      expect(parseRoute(`#/${pathOfSection(id!)}`)?.path).toBe(`progress/${p}`);
    }
  });
  it('sections without an address open plain Progress, and the plain address names no section', () => {
    for (const s of SECTIONS.filter(x => x.page === null)) expect(pathOfSection(s.id)).toBe('progress');
    expect(sectionOfPage(null)).toBeNull();
    expect(sectionOfPage('nope')).toBeNull();
  });
  it('picks the last section scrolled up to the offset, the first at the top, the last at the end', () => {
    const tops = { overview: -400, history: -50, muscles: 300, goals: 700 };
    expect(currentSection(tops, 24, false)).toBe('history');
    expect(currentSection({ overview: 90 }, 24, false)).toBe('overview');
    expect(currentSection(tops, 24, true)).toBe('body');
    expect(currentSection({}, 24, false)).toBe('overview');
  });
  it('says whether there is anything to chart', () => {
    expect(hasProgressData({}, 0)).toBe(false);
    expect(hasProgressData({ hack: [] }, 0)).toBe(false);
    expect(hasProgressData({ hack: [{}] }, 0)).toBe(true);
    expect(hasProgressData({}, 1)).toBe(true);
  });
});
