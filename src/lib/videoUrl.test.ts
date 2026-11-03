import { describe, it, expect } from 'vitest';
import { VIDEO_ERR, isVideoUrl } from './data.js';

describe('video link check', () => {
  it('accepts http:// and https:// links', () => {
    expect(isVideoUrl('http://x.y/z')).toBe(true);
    expect(isVideoUrl('https://x.y/z')).toBe(true);
  });
  it('refuses other schemes and bare domains', () => {
    expect(isVideoUrl('ftp://x')).toBe(false);
    expect(isVideoUrl('x.y/z')).toBe(false);
  });
  it('the message names both schemes the check accepts', () => {
    expect(VIDEO_ERR).toBe('Video link should start with http:// or https://');
  });
});
