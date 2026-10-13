import { describe, it, expect, vi, afterEach } from 'vitest';
import { isTouchScreen, revealField } from './revealField.ts';

const box = (top, bottom) => ({ top, bottom });
const el = (top, bottom, connected = true) => ({ isConnected: connected, getBoundingClientRect: () => box(top, bottom), scrollIntoView: vi.fn() });
const viewport = (height, offsetTop = 0) => vi.stubGlobal('window', { innerHeight: height, visualViewport: { height, offsetTop } });
afterEach(() => vi.unstubAllGlobals());

describe('revealField', () => {
  it('does nothing when the field is already inside the sheet and the viewport', () => {
    viewport(800);
    const f = el(300, 344);
    expect(revealField(el(100, 700), f)).toBe(false);
    expect(f.scrollIntoView).not.toHaveBeenCalled();
  });
  it('centres a field the keyboard covers (below the visible viewport)', () => {
    viewport(400); // keyboard took the lower half
    const f = el(500, 544);
    expect(revealField(el(100, 700), f)).toBe(true);
    expect(f.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
  });
  it('centres a field scrolled out of the sheet', () => {
    viewport(800);
    const f = el(50, 94);
    expect(revealField(el(100, 700), f)).toBe(true);
  });
  it('ignores a field that has left the page', () => {
    viewport(400);
    const f = el(500, 544, false);
    expect(revealField(el(100, 700), f)).toBe(false);
    expect(f.scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('isTouchScreen', () => {
  it('is true only for a coarse pointer', () => {
    vi.stubGlobal('matchMedia', q => ({ matches: q === '(pointer:coarse)' }));
    expect(isTouchScreen()).toBe(true);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(isTouchScreen()).toBe(false);
  });
  it('is false where matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(isTouchScreen()).toBe(false);
  });
});
