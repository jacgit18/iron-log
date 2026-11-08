import { describe, expect, it } from 'vitest';
import { MAX_INGREDIENTS, MAX_RECIPE_ID, MAX_STEPS, MAX_TAG, MAX_TAGS, MAX_TAGS_PER_RECIPE, normRecipe, normRecipeChips, normRecipes, normTags, validRecipe } from './recipes.js';

const base = { id: 'r1', n: 'Chili', cat: 'protein', ing: [{ n: 'Beans', amt: '2 cans' }], steps: ['Simmer.'] };

describe('normRecipe', () => {
  it('keeps fav: true and drops any other value (brief nutrition-quick-log)', () => {
    expect(normRecipe({ ...base, fav: true })).toEqual({ ...base, fav: true });
    expect(normRecipe({ ...base, fav: 'yes' })).toEqual(base);
    expect(validRecipe({ ...base, fav: true })).toBe(true);
  });
  it('keeps a clean recipe as it is', () => {
    expect(normRecipe(base)).toEqual(base);
    expect(validRecipe(base)).toBe(true);
  });
  it('keeps a ready-made food: its category, no ingredients or steps, its numbers', () => {
    const r = { id: 'lasagna', n: 'Frozen lasagna', cat: 'ready', ing: [], steps: [], kcal: 420, p: 22 };
    expect(normRecipe(r)).toEqual(r);
    expect(validRecipe(r)).toBe(true);
    expect(normRecipe({ ...base, cat: 'sides' })?.cat).toBe('sides'); // existing categories are unchanged
    expect(normRecipe({ ...base, cat: 'carbs' })?.cat).toBe('carbs'); // Carbs is a category of its own
    expect(validRecipe({ ...base, cat: 'carbs' })).toBe(true);
    expect(normRecipe({ ...base, cat: 'frozen' })?.cat).toBe('other'); // an unknown one still becomes Other
  });
  it('needs an id and a name', () => {
    expect(normRecipe({ ...base, id: '' })).toBeNull();
    expect(normRecipe({ ...base, n: '  ' })).toBeNull();
    expect(normRecipe({ ...base, id: 'constructor' })).toBeNull();
    expect(normRecipe('x')).toBeNull();
  });
  it('turns an unknown category into Other and drops blank lines', () => {
    const r = normRecipe({ ...base, cat: 'soup', ing: [{ n: ' ' }, { n: 'Salt' }, null], steps: ['', 'Stir.'] });
    expect(r).toMatchObject({ cat: 'other', ing: [{ n: 'Salt' }], steps: ['Stir.'] });
  });
  it('caps the lists and the number fields', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ n: `i${i}` }));
    const r = normRecipe({ ...base, ing: many, steps: many.map(m => m.n), servings: 0, minutes: 99999 })!;
    expect(r.ing).toHaveLength(MAX_INGREDIENTS);
    expect(r.steps).toHaveLength(MAX_STEPS);
    expect(r).not.toHaveProperty('servings');
    expect(r).not.toHaveProperty('minutes');
  });
  it('keeps from only when it is a catalog id', () => {
    expect(normRecipe({ ...base, from: 'c:wbc:chili' })).toHaveProperty('from', 'c:wbc:chili');
    expect(normRecipe({ ...base, from: 'evil' })).not.toHaveProperty('from');
  });
});

describe('recipe video link', () => {
  const base = { id: 'r1', n: 'Soup', cat: 'dinner', ing: [{ n: 'Onion' }], steps: ['Cook.'] };
  it('keeps a web link and loads an old recipe without one unchanged', () => {
    expect(normRecipe({ ...base, url: 'https://youtu.be/abc' })?.url).toBe('https://youtu.be/abc');
    expect(normRecipe(base)).not.toHaveProperty('url');
  });
  it('drops anything that is not an http or https address', () => {
    for (const bad of ['javascript:alert(1)', 'youtube.com/x', 'file:///etc/passwd', 'https://a b', '', '  ', 42, null]) expect(normRecipe({ ...base, url: bad })).not.toHaveProperty('url');
  });
  it('drops a link over 500 characters and keeps one on a saved library copy', () => {
    expect(normRecipe({ ...base, url: 'https://x.com/' + 'a'.repeat(500) })).not.toHaveProperty('url');
    expect(normRecipe({ ...base, from: 'c:wbc:r1', url: 'https://vimeo.com/1' })?.url).toBe('https://vimeo.com/1');
  });
});

describe('serving size', () => {
  it('keeps the words and the grams, and a recipe without them is unchanged', () => {
    const r = normRecipe({ ...base, serving: ' 1 cup ', servingG: 250 });
    expect(r).toMatchObject({ serving: '1 cup', servingG: 250 });
    expect(validRecipe({ ...base, serving: '1 cup', servingG: 250 })).toBe(true);
    expect(normRecipe(base)).not.toHaveProperty('serving');
    expect(normRecipe(base)).not.toHaveProperty('servingG');
  });
  it('drops empty words, and grams that are not a whole number from 1 to 5000', () => {
    for (const servingG of [0, -5, 2.5, 5001, '250', null]) expect(normRecipe({ ...base, serving: '', servingG })).not.toHaveProperty('servingG');
    expect(normRecipe({ ...base, serving: '' })).not.toHaveProperty('serving');
    expect(normRecipe({ ...base, serving: 'x'.repeat(60) })?.serving).toHaveLength(40);
    expect(normRecipe({ ...base, servingG: 5000 })?.servingG).toBe(5000);
  });
});

describe('validRecipe', () => {
  it('refuses what the app would never send', () => {
    expect(validRecipe({ ...base, cat: 'soup' })).toBe(false);
    expect(validRecipe({ ...base, extra: 1 })).toBe(false);
    expect(validRecipe({ ...base, n: ' Chili' })).toBe(false);
    expect(validRecipe(null)).toBe(false);
  });
});

describe('normRecipes', () => {
  it('drops what cannot be used and a repeated id, and tolerates a non-list', () => {
    expect(normRecipes([base, { ...base, n: 'Again' }, { id: 'x' }, null])).toEqual([base]);
    expect(normRecipes(undefined)).toEqual([]);
  });
});

describe('swap, skip and Edited', () => {
  it('keeps a swap and a skip, and drops a swap equal to the name or empty', () => {
    const r = normRecipe({ ...base, ing: [{ n: 'Beans', sub: ' pinto beans ', skip: true }, { n: 'Rice', sub: 'rice' }, { n: 'Salt', sub: ' ' }, { n: 'Oil', skip: 'yes' }] })!;
    expect(r.ing).toEqual([{ n: 'Beans', sub: 'pinto beans', skip: true }, { n: 'Rice' }, { n: 'Salt' }, { n: 'Oil' }]);
  });
  it('keeps Edited only on a copy with a library source', () => {
    expect(normRecipe({ ...base, from: 'c:wbc:chili', edited: true })).toHaveProperty('edited', true);
    expect(normRecipe({ ...base, edited: true })).not.toHaveProperty('edited');
    expect(normRecipe({ ...base, from: 'c:wbc:chili', edited: 'yes' })).not.toHaveProperty('edited');
  });
  it('accepts the new fields as clean and still reads a recipe saved before them', () => {
    expect(validRecipe({ ...base, ing: [{ n: 'Beans', sub: 'pinto beans', skip: true }], from: 'c:wbc:chili', edited: true })).toBe(true);
    expect(validRecipe(base)).toBe(true);
  });
});

describe('rid: a link to one of your sauces or seasonings', () => {
  it('keeps a clean rid and accepts it as valid (the API takes what the app writes)', () => {
    const r = { ...base, ing: [{ n: 'Taco seasoning', amt: '2 tbsp', rid: 'taco-seasoning' }] };
    expect(normRecipe(r)).toEqual(r);
    expect(validRecipe(r)).toBe(true);
  });
  it('drops an empty or reserved rid, and cuts one that is too long; the line stays', () => {
    const r = normRecipe({ ...base, ing: [{ n: 'A', rid: ' ' }, { n: 'B', rid: 'constructor' }, { n: 'C', rid: 'x'.repeat(200) }] })!;
    expect(r.ing[0]).toEqual({ n: 'A' });
    expect(r.ing[1]).toEqual({ n: 'B' });
    expect(r.ing[2]!.rid).toHaveLength(MAX_RECIPE_ID);
    expect(validRecipe({ ...base, ing: [{ n: 'B', rid: 'constructor' }] })).toBe(false);
  });
});

describe('recipe tags', () => {
  it('keeps clean tags and drops the field when there are none', () => {
    const r = { ...base, tags: ['weeknight', 'Meal prep'] };
    expect(normRecipe(r)).toEqual(r);
    expect(validRecipe(r)).toBe(true);
    expect('tags' in normRecipe({ ...base, tags: ['', '  ', 5] })!).toBe(false);
  });
  it('collapses spaces, cuts the length, drops repeats of any case and caps the count', () => {
    expect(normTags(['  Meal   prep ', 'meal PREP', 'x'.repeat(40)])).toEqual(['Meal prep', 'x'.repeat(MAX_TAG)]);
    expect(normTags(Array.from({ length: 12 }, (_, i) => `t${i}`))).toHaveLength(MAX_TAGS_PER_RECIPE);
    expect(normTags('weeknight')).toEqual([]);
    expect(validRecipe({ ...base, tags: ['a', 'A'] })).toBe(false); // the API refuses what the app would not send
  });
  it('allows at most MAX_TAGS different tags in a list, the first spelling winning', () => {
    const list = Array.from({ length: 6 }, (_, i) => ({ ...base, id: `r${i}`, tags: Array.from({ length: 6 }, (_, j) => `t${i * 6 + j}`) }));
    const out = normRecipes([...list, { ...base, id: 'late', tags: ['T0', 't99'] }]);
    const all = new Set(out.flatMap(r => (r.tags ?? []).map(t => t.toLowerCase())));
    expect(all.size).toBe(MAX_TAGS);
    expect(out.find(r => r.id === 'late')!.tags).toEqual(['t0']); // joins the tag already in use; the new one is over the limit
  });
});

describe('normRecipeChips', () => {
  it('keeps known categories without repeats', () => {
    expect(normRecipeChips({ hide: ['drinks', 'drinks', 'soup'], order: ['sides', 'protein'] })).toEqual({ hide: ['drinks'], order: ['sides', 'protein'] });
  });
  it('is null when nothing usable is left', () => {
    expect(normRecipeChips({ hide: [], order: ['nope'] })).toBeNull();
    expect(normRecipeChips('x')).toBeNull();
    expect(normRecipeChips([])).toBeNull();
  });
});

describe('usual amount and unit name (ready-made foods)', () => {
  const food = { id: 'egg', n: 'Egg', cat: 'ready', ing: [], steps: [], kcal: 72, p: 6 };
  it('keeps a usual amount, a unit and a plural on a ready-made food and round-trips through validRecipe', () => {
    const r = normRecipe({ ...food, usual: 4, unit: 'loaf', plural: 'loaves' });
    expect(r).toMatchObject({ usual: 4, unit: 'loaf', plural: 'loaves' });
    expect(validRecipe(r)).toBe(true);
  });
  it('drops them from any other category, and drops bad values', () => {
    expect(normRecipe({ ...food, cat: 'protein', usual: 4, unit: 'egg' })).not.toHaveProperty('usual');
    expect(normRecipe({ ...food, cat: 'protein', usual: 4, unit: 'egg' })).not.toHaveProperty('unit');
    const bad = normRecipe({ ...food, usual: 2.3, unit: '4 eggs', plural: 'x' });
    expect(bad).not.toHaveProperty('usual');
    expect(bad).not.toHaveProperty('unit');
    expect(bad).not.toHaveProperty('plural'); // a plural needs a unit
    expect(normRecipe({ ...food, usual: 1 })).not.toHaveProperty('usual');
    expect(normRecipe({ ...food, usual: 100 })).not.toHaveProperty('usual');
  });
  it('is not a valid recipe while it carries a value normRecipe would change', () => {
    expect(validRecipe({ ...food, usual: 2.3 })).toBe(false);
  });
});

describe('food type (ready-made foods)', () => {
  const food = { id: 'milk', n: 'Whole milk', cat: 'ready', ing: [], steps: [], kcal: 150, p: 8 };
  it('keeps a valid type on a ready-made food and round-trips it', () => {
    for (const type of ['ingredient', 'ready', 'drink']) {
      const r = { ...food, type };
      expect(normRecipe(r)).toEqual(r);
      expect(validRecipe(r)).toBe(true);
    }
  });
  it('drops an unknown type, and a type on a recipe that is not ready-made', () => {
    expect(normRecipe({ ...food, type: 'soup' })).toEqual(food);
    expect(validRecipe({ ...food, type: 'soup' })).toBe(false);
    expect(normRecipe({ ...base, type: 'drink' })).toEqual(base);
  });
  it('keeps a food that an older app build loaded: with the type field stripped it is still a valid, untyped ready-made food', () => {
    const { type: _t, ...old } = { ...food, type: 'drink' };
    expect(normRecipe(old)).toEqual(old);
    expect(validRecipe(old)).toBe(true);
  });
  it('leaves an untyped food untyped', () => {
    expect(normRecipe(food)).not.toHaveProperty('type');
    expect(normRecipes([food, { ...food, id: 'k', n: 'Kefir', type: 'drink' }]).map(r => r.type)).toEqual([undefined, 'drink']);
  });
});
