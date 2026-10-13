import { describe, it, expect } from 'vitest';
import { DEFAULT_CFG } from './logic.js';
import { catalogPickError, catalogSnapshot } from './catalogExercise.js';

const cfg = (ex = {}) => ({ ...structuredClone(DEFAULT_CFG), ex });
const item = (over = {}) => ({ id: 'c:fedb:Cable_Fly', name: ' Cable   Fly ', data: { eq: 'cable' as const, muscles: { p: ['chest' as const], s: [] } }, ...over });

describe('catalogPickError', () => {
  it('accepts a new one and one already in the library, refuses a bad id or a name you already use', () => {
    expect(catalogPickError(cfg(), item())).toBeNull();
    expect(catalogPickError(cfg({ 'c:fedb:Cable_Fly': { n: 'Cable Fly' } }), item())).toBeNull();
    expect(catalogPickError(cfg(), item({ id: 'fly' }))).toMatch(/can’t be added/);
    expect(catalogPickError(cfg({ mine: { n: 'cable fly' } }), item())).toBe('You already have an exercise called Cable Fly.');
  });
});

describe('catalogSnapshot', () => {
  it('keeps the tidy name, the catalog equipment and the tags', () => {
    expect(catalogSnapshot(item())).toEqual({ info: { n: 'Cable Fly', eq: 'cable' }, tags: { p: ['chest'] } });
  });
  it('uses the equipment and video link from the sheet when it passes them; "" means none', () => {
    expect(catalogSnapshot(item(), { ne: 'machine', nu: 'https://youtu.be/x' }).info).toEqual({ n: 'Cable Fly', eq: 'machine', url: 'https://youtu.be/x' });
    expect(catalogSnapshot(item(), { ne: '' }).info).toEqual({ n: 'Cable Fly' });
    expect(catalogSnapshot(item({ data: {} })).tags).toBeNull();
  });
});
