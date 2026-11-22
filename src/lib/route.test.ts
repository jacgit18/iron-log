import { describe, expect, it } from 'vitest';
import { FOOD_SECTION_KEYS, PATHS, boardFix, boardView, dailyFix, foodSectionOf, foodSectionPath, programKey, programPath, dailySection, pageOf, parseRoute, PROGRESS_PAGES, routeHash } from './route.js';

// Screen addresses (brief navigation-urls): every address round-trips, an unknown one falls back to the screen above it, and none can carry personal data.
describe('parseRoute', () => {
  it('round-trips every known screen, and names its tab', () => {
    for (const p of PATHS) expect(parseRoute(routeHash(p))).toEqual({ tab: p.split('/')[0], path: p });
  });
  it('has a screen for each Progress page', () => {
    for (const p of PROGRESS_PAGES) expect(parseRoute(`#/progress/${p}`)?.path).toBe(`progress/${p}`);
  });
  it('falls back to the nearest known screen above an unknown ending', () => {
    expect(parseRoute('#/progress/zzz')).toEqual({ tab: 'progress', path: 'progress' });
    // Body weight and muscle details are part of the Progress page now; their old addresses open it.
    for (const gone of ['body', 'muscles']) expect(parseRoute(`#/progress/${gone}`)).toEqual({ tab: 'progress', path: 'progress' });
    expect(parseRoute('#/daily/recipes/1234/edit')).toEqual({ tab: 'daily', path: 'daily/recipes' });
  });
  it('gives null for nothing known, an empty hash, or an anchor that is not ours', () => {
    for (const h of ['', '#', '#/', '#view', '#/nope', '#/nope/progress']) expect(parseRoute(h)).toBeNull();
  });
  it('has a screen for the food type review, opened from the Recipes banner', () => {
    expect(parseRoute('#/daily/recipes/types')).toEqual({ tab: 'daily', path: 'daily/recipes/types' });
  });
  it('ignores case, a trailing slash and a query', () => {
    expect(parseRoute('#/Progress/Trends/')).toEqual({ tab: 'progress', path: 'progress/trends' });
    expect(parseRoute('#/program?x=1')).toEqual({ tab: 'program', path: 'program' });
  });
  it('holds screen names only: letters and slashes, no ids, emails, numbers or personal words', () => {
    for (const p of PATHS) expect(p).toMatch(/^[a-z]+(\/[a-z]+)*$/);
  });
});

describe('pageOf', () => {
  it('returns the part under a base, and null otherwise', () => {
    expect(pageOf('progress/trends', 'progress')).toBe('trends');
    expect(pageOf('progress', 'progress')).toBeNull();
    expect(pageOf('program/exercises', 'progress')).toBeNull();
    expect(pageOf('progress/zzz', 'progress')).toBeNull(); // not a screen
    expect(pageOf('daily/grocery/bought/history', 'daily/grocery')).toBe('bought/history');
    expect(pageOf('daily/grocery/receipts', 'daily/grocery')).toBe('receipts');
    expect(pageOf('daily/grocery/bought', 'daily/grocery')).toBe('bought');
    expect(pageOf('daily/grocery/shopping', 'daily/grocery')).toBe('shopping');
    expect(pageOf('daily/grocery/inventory', 'daily/grocery')).toBe('inventory');
  });
  it('keeps the old Grocery addresses opening the renamed screens', () => {
    expect(parseRoute('#/daily/grocery/get')?.path).toBe('daily/grocery/shopping');
    expect(parseRoute('#/daily/grocery/home')?.path).toBe('daily/grocery/inventory');
    expect(parseRoute('#/daily/grocery/spend')?.path).toBe('daily/grocery/bought/history');
  });
});

describe('dailySection and dailyFix', () => {
  const keys = ['grocery', 'supplements', 'recipes'];
  it('names the section an address points at, only when it is offered', () => {
    expect(dailySection('daily/recipes', keys)).toBe('recipes');
    expect(dailySection('daily/recipes/mine', keys)).toBe('recipes');
    expect(dailySection('daily/grocery/bought/history', keys)).toBe('grocery');
    expect(dailySection('daily/medical', keys)).toBeNull(); // not offered to this person
    expect(dailySection('daily', keys)).toBeNull();
    expect(dailySection('progress/trends', keys)).toBeNull();
  });
  it('rewrites the address only when it does not name the section shown', () => {
    expect(dailyFix('daily', 'supplements')).toBe('daily/nutrition');
    expect(dailyFix('daily/medical', 'supplements')).toBe('daily/nutrition');
    expect(dailyFix('daily/nutrition', 'supplements')).toBeNull();
    expect(dailyFix('daily/recipes/mine', 'recipes')).toBeNull(); // a deeper page is left as it is
    expect(dailyFix('progress', 'recipes')).toBeNull();
  });
});

describe('boardView and boardFix', () => {
  it('names the section an address points at, and null for plain board or another screen', () => {
    expect(boardView('board/stretches')).toBe('stretches');
    expect(boardView('board/workout')).toBe('workout');
    expect(boardView('board')).toBeNull();
    expect(boardView('program/stretches')).toBeNull();
  });
  it('rewrites only plain board to the section shown', () => {
    expect(boardFix('board', 'stretches')).toBe('board/stretches');
    expect(boardFix('board/workout', 'workout')).toBeNull();
    expect(boardFix('daily', 'workout')).toBeNull();
  });
  it('falls back to Board for an unknown section', () => expect(parseRoute('#/board/zzz')).toEqual({ tab: 'board', path: 'board' }));
});

describe('Nutrition and Program addresses', () => {
  it('names the Nutrition section by its address, and still opens the old one', () => {
    expect(dailySection('daily/nutrition', ['grocery', 'supplements'])).toBe('supplements');
    expect(parseRoute('#/daily/supplements')).toEqual({ tab: 'daily', path: 'daily/nutrition' });
  });
  it('maps A and B to program addresses and back, and leaves a library program out', () => {
    expect(programKey('program/b')).toBe('B');
    expect(programKey('program/exercises')).toBeNull();
    expect(programPath('A')).toBe('program/a');
    expect(programPath('L:123')).toBeNull();
  });
});

// Foods sections (brief foods-made-and-store-bought): each section is its own address, and a library recipe's page moved under Library.
describe('Foods section addresses', () => {
  it('has an address for each of the six sections and for a library recipe page', () => {
    for (const k of ['meals', 'recipes', 'library', 'ingredients', 'ready', 'drinks'] as const) expect(parseRoute(`#/daily/recipes/${k}`)).toEqual({ tab: 'daily', path: `daily/recipes/${k}` });
    expect(parseRoute('#/daily/recipes/library/item')).toEqual({ tab: 'daily', path: 'daily/recipes/library/item' });
    expect(FOOD_SECTION_KEYS).toHaveLength(6);
    for (const k of FOOD_SECTION_KEYS) expect(PATHS).toContain(foodSectionPath(k));
  });
  it('keeps the unchanged addresses and the Daily section for every one of them', () => {
    for (const p of ['daily/recipes', 'daily/recipes/mine', 'daily/recipes/mine/sauce', 'daily/recipes/form', 'daily/recipes/types']) expect(parseRoute(`#/${p}`)?.path).toBe(p);
    for (const p of PATHS.filter(x => x.startsWith('daily/recipes'))) expect(dailySection(p, ['grocery', 'supplements', 'recipes'])).toBe('recipes');
  });
  it('reads the section from an address, or null for the bare address and the recipe pages', () => {
    expect(foodSectionOf('daily/recipes/ready')).toBe('ready');
    expect(foodSectionOf('daily/recipes/library')).toBe('library');
    expect(foodSectionOf('daily/recipes/library/item')).toBe('library');
    for (const p of ['daily/recipes', 'daily/recipes/mine', 'daily/recipes/mine/sauce', 'daily/recipes/form', 'daily/recipes/types', 'daily/grocery', 'progress']) expect(foodSectionOf(p)).toBeNull();
    expect(foodSectionOf('daily/recipesx')).toBeNull();
  });
  it('treats an unknown ending under a section as that section, and an old recipe address as the screen above', () => {
    expect(parseRoute('#/daily/recipes/ready/zzz')?.path).toBe('daily/recipes/ready');
    expect(parseRoute('#/daily/recipes/1234/edit')?.path).toBe('daily/recipes');
  });
  it('leaves a section address as it is for the Daily section fix, and the bare address is fixed to the section shown', () => {
    expect(dailyFix('daily/recipes/ready', 'recipes')).toBeNull();
    expect(dailyFix('daily/recipes/library/item', 'recipes')).toBeNull();
  });
  it('keeps section addresses to screen names (no ids, emails or numbers)', () => {
    for (const k of FOOD_SECTION_KEYS) expect(foodSectionPath(k)).toMatch(/^daily\/recipes\/[a-z]+$/);
  });
});
