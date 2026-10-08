import { describe, expect, it } from 'vitest';
import { devHeader } from './devUser.js';

describe('devHeader', () => {
  it('sends the dev user the browser remembers (the landing page\'s skip button chooses "dev")', () => {
    expect(devHeader('dev', true)).toEqual({ 'x-dev-user': 'dev' });
    expect(devHeader('ann', true)).toEqual({ 'x-dev-user': 'ann' });
  });
  it('sends nothing by default: a development browser is a stranger, so it shows the landing page', () => {
    expect(devHeader(null, true)).toEqual({});
    expect(devHeader(undefined, true)).toEqual({});
  });
  it('sends nothing for "off", or for a name that is not a plain lowercase name', () => {
    for (const bad of ['off', 'Ann', "x'; drop table users", '', 5, {}, 'a'.repeat(41)]) expect(devHeader(bad, true)).toEqual({});
  });
  it('a production build never sends it, whatever the browser remembers', () => {
    for (const name of [null, 'ann', 'off']) expect(devHeader(name, false)).toEqual({});
  });
});
