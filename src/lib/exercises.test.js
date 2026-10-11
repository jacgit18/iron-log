import { describe, it, expect } from 'vitest';
import { findExId, exerciseChoice, EQUIPMENT, EQ_KEYS } from './data.js';

const cfg = { ex: { 'my-row': { n: 'My Cable Row' } } };

describe('typing an exercise name', () => {
  it('finds a built-in or custom exercise by name, ignoring case and spacing', () => {
    expect(findExId(cfg, 'Hack Squat')).toBe('hack');
    expect(findExId(cfg, '  hack   squat ')).toBe('hack');
    expect(findExId(cfg, 'my cable row')).toBe('my-row');
    expect(findExId(cfg, 'Cable Lateral Raise')).toBeNull();
    expect(findExId(cfg, '   ')).toBeNull();
  });
  it('turns a typed name into the sheet fields: an existing id, a new one, or nothing', () => {
    expect(exerciseChoice(cfg, 'hack squat')).toEqual({ ex: 'hack', nn: '' });
    expect(exerciseChoice(cfg, '  Cable  Lateral Raise ')).toEqual({ ex: '__new', nn: 'Cable Lateral Raise' });
    expect(exerciseChoice(cfg, '')).toEqual({ ex: '', nn: '' });
    expect(exerciseChoice({}, 'Hack Squat')).toEqual({ ex: 'hack', nn: '' });
  });
});

describe('equipment list', () => {
  it('menus list equipment in alphabetical order, with Other last', () => {
    const labels = EQ_KEYS.map(k => EQUIPMENT[k]);
    expect(labels.at(-1)).toBe('Other');
    const rest = labels.slice(0, -1);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
    for (const l of ['Sled', 'Tire', 'Bench', 'Sand bag', 'Rope', 'Vest', 'Trap bar']) expect(labels).toContain(l);
  });
});
