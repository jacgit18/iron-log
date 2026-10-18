import { describe, expect, it } from 'vitest';
import { timeAgo } from './timeAgo.js';

const NOW = Date.parse('2026-10-18T12:00:00Z');
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

describe('timeAgo', () => {
  it('says just now under a minute, then minutes, hours, days, months and years', () => {
    expect(timeAgo(ago(20), NOW)).toBe('just now');
    expect(timeAgo(ago(90), NOW)).toBe('1 minute ago');
    expect(timeAgo(ago(3 * 3600), NOW)).toBe('3 hours ago');
    expect(timeAgo(ago(86_400), NOW)).toBe('yesterday');
    expect(timeAgo(ago(5 * 86_400), NOW)).toBe('5 days ago');
    expect(timeAgo(ago(70 * 86_400), NOW)).toBe('2 months ago');
    expect(timeAgo(ago(800 * 86_400), NOW)).toBe('2 years ago');
  });
  it('treats a time in the future or a bad string quietly', () => {
    expect(timeAgo(ago(-500), NOW)).toBe('just now');
    expect(timeAgo('not a date', NOW)).toBe('');
  });
});
