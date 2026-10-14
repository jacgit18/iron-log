import { describe, it, expect } from 'vitest';
import { eqName, eqOptions, findEq, newEqId, eqNameError } from './equipment.js';

const cfg = { equipment: { 'x:landmine': 'Landmine', 'x:ab-wheel': 'Ab wheel' } };

describe('equipment list', () => {
  it('names built-ins and added items, and nothing for an unknown id', () => {
    expect(eqName(cfg, 'barbell')).toBe('Barbell');
    expect(eqName(cfg, 'x:landmine')).toBe('Landmine');
    expect(eqName(cfg, 'x:gone')).toBe('');
    expect(eqName({}, 'constructor')).toBe('');
    expect(eqName(cfg, '')).toBe('');
  });
  it('lists built-ins and added items alphabetically with Other last', () => {
    const names = eqOptions(cfg).map(o => o.name);
    expect(names[0]).toBe('Ab wheel');
    expect(names).toContain('Landmine');
    expect(names.indexOf('Kettlebell')).toBeLessThan(names.indexOf('Landmine'));
    expect(names.indexOf('Landmine')).toBeLessThan(names.indexOf('Machine'));
    expect(names[names.length - 1]).toBe('Other');
    expect(eqOptions({}).length).toBe(20);
  });
  it('finds a name whatever its capitalization or spacing', () => {
    expect(findEq(cfg, '  landMINE ')).toBe('x:landmine');
    expect(findEq(cfg, 'ez  bar')).toBe('ezbar');
    expect(findEq(cfg, 'Sled')).toBe('sled');
    expect(findEq(cfg, 'Rower')).toBeNull();
  });
  it('makes a slug id and numbers it when taken', () => {
    expect(newEqId({}, 'Safety Squat Bar!')).toBe('x:safety-squat-bar');
    expect(newEqId(cfg, 'Landmine')).toBe('x:landmine-2');
    expect(newEqId({}, '???')).toBe('x:item');
  });
  it('refuses a blank, long or repeated name, and too many', () => {
    expect(eqNameError(cfg, '   ')).toMatch(/Type the name/);
    expect(eqNameError(cfg, 'x'.repeat(31))).toMatch(/30 characters/);
    expect(eqNameError(cfg, 'barbell')).toMatch(/already in the list/);
    expect(eqNameError(cfg, 'LANDMINE')).toMatch(/already in the list/);
    expect(eqNameError(cfg, 'Rower')).toBeNull();
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`x:e${i}`, `E${i}`]));
    expect(eqNameError({ equipment: many }, 'One more')).toMatch(/up to 30/);
  });
});
