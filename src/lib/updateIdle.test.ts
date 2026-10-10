import { describe, it, expect } from 'vitest';
import { canAutoReload, isTyping, lastAutoReload, markAutoReload, QUIET_MS, LOOP_GUARD_MS, type IdleInputs } from './updateIdle.js';

const idle: IdleInputs = { timing: false, modalOpen: false, importing: false, unsavedCount: 0, typing: false, sinceInputMs: QUIET_MS, sinceAutoReloadMs: LOOP_GUARD_MS };

describe('canAutoReload', () => {
  it('applies the update when nothing is in use', () => expect(canAutoReload(idle)).toBe(true));
  it.each([
    ['a timer is running', { timing: true }],
    ['a sheet is open', { modalOpen: true }],
    ['an import is being reviewed', { importing: true }],
    ['a write is not saved yet', { unsavedCount: 1 }],
    ['a text field has focus', { typing: true }],
    ['the last tap was just now', { sinceInputMs: QUIET_MS - 1 }],
    ['it reloaded for an update a moment ago', { sinceAutoReloadMs: LOOP_GUARD_MS - 1 }],
  ] as [string, Partial<IdleInputs>][])('waits while %s', (_, over) => expect(canAutoReload({ ...idle, ...over })).toBe(false));
});

describe('isTyping', () => {
  it('is true for text fields and editable regions, false for buttons, checkboxes and nothing', () => {
    expect(isTyping({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isTyping({ tagName: 'INPUT', type: 'number' })).toBe(true);
    expect(isTyping({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTyping({ tagName: 'SELECT' })).toBe(true);
    expect(isTyping({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTyping({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isTyping({ tagName: 'BUTTON' })).toBe(false);
    expect(isTyping({ tagName: 'BODY' })).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});

describe('auto-reload guard', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
  it('remembers the last automatic reload for the tab', () => {
    const s = mem();
    expect(lastAutoReload(s)).toBe(0);
    markAutoReload(1234, s);
    expect(lastAutoReload(s)).toBe(1234);
  });
  it('treats blocked storage as never reloaded, without throwing', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(lastAutoReload(blocked)).toBe(0);
    expect(() => markAutoReload(1, blocked)).not.toThrow();
    expect(lastAutoReload(null)).toBe(0);
  });
});
