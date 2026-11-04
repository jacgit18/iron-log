import { describe, expect, it } from 'vitest';
import { PAGE_PATHS } from '../../server/pagePaths.js';
import { PAGE_PATH_PATTERNS } from './pagePaths.js';

const swAllows = (pathAndQuery: string): boolean => PAGE_PATH_PATTERNS.some(p => p.test(pathAndQuery));

describe('page paths the service worker lets through', () => {
  it('accepts every path the server serves as a page, with or without a query', () => {
    for (const p of PAGE_PATHS) {
      expect(swAllows(p), p).toBe(true);
      expect(swAllows(`${p}?x=1`), `${p}?x=1`).toBe(true);
    }
    expect(swAllows('/?open=board')).toBe(true);
    expect(swAllows('/?share_title=a&share_url=b')).toBe(true);
  });

  it('refuses what the server answers with a 404', () => {
    for (const p of ['/zzz', '/board', '/board/x', '/Plans', '/plansx', '/plans/x', '/privacy', '/zzz?open=board']) expect(swAllows(p), p).toBe(false);
  });
});
