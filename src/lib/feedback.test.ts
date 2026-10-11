import { describe, expect, it } from 'vitest';
import { feedbackLink } from './feedback.js';

describe('feedbackLink', () => {
  it('passes an https form link through', () => {
    expect(feedbackLink('https://forms.gle/abc123')).toBe('https://forms.gle/abc123');
  });
  it('rejects empty, malformed and non-https links', () => {
    expect(feedbackLink('')).toBeNull();
    expect(feedbackLink('not a url')).toBeNull();
    expect(feedbackLink('javascript:alert(1)')).toBeNull();
    expect(feedbackLink('http://forms.gle/abc')).toBeNull();
  });
});
