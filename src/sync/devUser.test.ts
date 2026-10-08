import { describe, expect, it } from 'vitest';
import { devHeader } from './devUser.js';

describe('devHeader', () => {
  it('names the default dev user, or the one the browser remembers', () => {
    expect(devHeader(null, true)).toEqual({ 'x-dev-user': 'dev' });
    expect(devHeader('ann', true)).toEqual({ 'x-dev-user': 'ann' });
  });
  it('ignores a name that is not a plain lowercase name', () => {
    for (const bad of ['Ann', "x'; drop table users", '', 5, {}, 'a'.repeat(41)]) expect(devHeader(bad, true)).toEqual({ 'x-dev-user': 'dev' });
  });
  it('"off" sends nothing, so a development browser can be a stranger', () => {
    expect(devHeader('off', true)).toEqual({});
  });
  it('a production build never sends it, whatever the browser remembers', () => {
    for (const name of [null, 'ann', 'off']) expect(devHeader(name, false)).toEqual({});
  });
});
