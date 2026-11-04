import { describe, expect, it } from 'vitest';
import { PAGE_PATHS } from '../../server/pagePaths.js';
import { pagePathPatterns } from './pagePaths.js';

const swAllows = (pathAndQuery: string, base?: string): boolean => pagePathPatterns(base).some(p => p.test(pathAndQuery));

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

describe('a build served from a sub-path', () => {
  it('lets that folder and its plans page through, and nothing else', () => {
    for (const p of ['/iron-log/', '/iron-log/?open=board', '/iron-log/plans', '/iron-log/plans/']) expect(swAllows(p, '/iron-log/'), p).toBe(true);
    for (const p of ['/', '/plans', '/iron-log/zzz', '/iron-log/plans/x', '/iron-logx/']) expect(swAllows(p, '/iron-log/'), p).toBe(false);
  });
});
