import { describe, expect, it } from 'vitest';
import { termsDecision, termsHeading, tickIsFresh, TICK_MAX_AGE_MS } from './termsGate.js';

const cur = { terms: '1.3', privacy: '1.6' };

describe('termsDecision', () => {
  it('asks a never-accepted account for both pages', () => {
    const d = termsDecision(cur, { terms: null, privacy: null });
    expect(d).toEqual({ needed: true, first: true, changed: ['terms', 'privacy'] });
  });
  it('asks for nothing when both match', () => {
    expect(termsDecision(cur, { terms: '1.3', privacy: '1.6' })).toEqual({ needed: false, first: false, changed: [] });
  });
  it('asks again for only the page whose version moved', () => {
    expect(termsDecision(cur, { terms: '1.3', privacy: '1.5' })).toMatchObject({ needed: true, first: false, changed: ['privacy'] });
    expect(termsDecision(cur, { terms: '1.2', privacy: '1.6' })).toMatchObject({ needed: true, changed: ['terms'] });
  });
  it('asks everyone again when the constants are bumped', () => {
    const bumped = { terms: '1.4', privacy: '1.7' };
    expect(termsDecision(bumped, { terms: '1.3', privacy: '1.6' }).needed).toBe(true);
  });
  it('treats an older stored version as not accepted, and an unknown newer one too', () => {
    expect(termsDecision(cur, { terms: '1.4', privacy: '1.6' }).needed).toBe(true);
  });
});

describe('termsHeading', () => {
  it('names what changed', () => {
    expect(termsHeading({ needed: true, first: true, changed: ['terms', 'privacy'] })).toBe('Before you continue');
    expect(termsHeading({ needed: true, first: false, changed: ['privacy'] })).toBe('We updated our Privacy Policy');
    expect(termsHeading({ needed: true, first: false, changed: ['terms', 'privacy'] })).toBe('We updated our Terms of Use and Privacy Policy');
  });
});

describe('tickIsFresh', () => {
  const now = 1_000_000_000;
  it('accepts a recent tick only', () => {
    expect(tickIsFresh(String(now - 1000), now)).toBe(true);
    expect(tickIsFresh(String(now - TICK_MAX_AGE_MS - 1), now)).toBe(false);
    expect(tickIsFresh(String(now + 5000), now)).toBe(false);
    expect(tickIsFresh(null, now)).toBe(false);
    expect(tickIsFresh('yes', now)).toBe(false);
  });
});
