import { describe, expect, it } from 'vitest';
import { holdShare, linkFromShare, setRecipeStart, shareFromSearch, takeRecipeStart, takeShare } from './shareTarget.js';

describe('linkFromShare', () => {
  it('takes the url field, else the first address inside the text', () => {
    expect(linkFromShare({ url: 'https://youtu.be/abc' })).toBe('https://youtu.be/abc');
    expect(linkFromShare({ text: 'Great squat video https://youtu.be/abc?t=5 watch it' })).toBe('https://youtu.be/abc?t=5');
    expect(linkFromShare({ url: 'not a link', text: 'see https://vimeo.com/1.' })).toBe('https://vimeo.com/1');
  });
  it('refuses anything that is not a web address, and an over-long one', () => {
    for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://x.com/a', 'youtube.com/x', 'https://a b', '']) expect(linkFromShare({ url: bad })).toBeNull();
    expect(linkFromShare({ url: 'https://x.com/' + 'a'.repeat(500) })).toBeNull();
    expect(linkFromShare({})).toBeNull();
  });
});

describe('shareFromSearch', () => {
  it('reads the three parameters', () => {
    expect(shareFromSearch('?share_title=Leg%20day&share_url=https%3A%2F%2Fyoutu.be%2Fabc')).toEqual({ title: 'Leg day', url: 'https://youtu.be/abc' });
  });
  it('uses the text without its address as the title when none came', () => {
    expect(shareFromSearch('?share_text=Best%20soup%20https%3A%2F%2Fexample.com%2Fsoup')).toEqual({ title: 'Best soup', url: 'https://example.com/soup' });
  });
  it('is null without a share parameter, and has an empty url when nothing usable came', () => {
    expect(shareFromSearch('?open=daily')).toBeNull();
    expect(shareFromSearch('')).toBeNull();
    expect(shareFromSearch('?share_text=just%20words')).toEqual({ title: 'just words', url: '' });
  });
  it('cuts a very long title', () => {
    expect(shareFromSearch('?share_title=' + 'a'.repeat(300))?.title).toHaveLength(80);
  });
});

describe('held shares', () => {
  it('are given out once', () => {
    holdShare({ title: 't', url: 'https://a.com' });
    expect(takeShare()).toEqual({ title: 't', url: 'https://a.com' });
    expect(takeShare()).toBeNull();
    setRecipeStart({ title: 'Soup', url: 'https://a.com' });
    expect(takeRecipeStart()?.title).toBe('Soup');
    expect(takeRecipeStart()).toBeNull();
  });
});
