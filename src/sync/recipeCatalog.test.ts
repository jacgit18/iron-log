import { describe, expect, it } from 'vitest';
import { cleanLibraryRecipe, searchRecipes } from './recipeCatalog.js';

const row = { id: 'c:wbc:r1', name: ' Dip ', data: { recipe: { cat: 'sauces', ing: ['1 cup yogurt', ' ', 5], steps: ['Stir.'], servings: 4, minutes: 0 } } };

describe('cleanLibraryRecipe', () => {
  it('keeps what is usable and trims the rest', () => {
    expect(cleanLibraryRecipe(row)).toEqual({ id: 'c:wbc:r1', name: 'Dip', data: { recipe: { cat: 'sauces', ing: ['1 cup yogurt'], steps: ['Stir.'], servings: 4 } } });
  });
  it('turns an unknown category into Other and refuses a row with no ingredients, steps, c: id or recipe', () => {
    expect(cleanLibraryRecipe({ ...row, data: { recipe: { ...row.data.recipe, cat: 'soup' } } })?.data.recipe?.cat).toBe('other');
    expect(cleanLibraryRecipe({ ...row, data: { recipe: { ...row.data.recipe, steps: [] } } })).toBeNull();
    expect(cleanLibraryRecipe({ ...row, id: 'x' })).toBeNull();
    expect(cleanLibraryRecipe({ ...row, data: {} })).toBeNull();
  });
});

describe('searchRecipes', () => {
  const ok = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
  it('asks for the words, the category and the page, and cleans the answer', async () => {
    let url = '';
    const doFetch = (async (u: string) => { url = u; return new Response(JSON.stringify({ items: [row, { id: 'bad' }], more: true }), { status: 200 }); }) as unknown as typeof fetch;
    const r = await searchRecipes(' dip ', 'sauces', 30, () => ({}), doFetch);
    expect(url).toBe('/api/catalog/search?kind=recipe&offset=30&q=dip&cat=sauces');
    expect(r).toMatchObject({ ok: true, more: true });
    expect(r.ok && r.items).toHaveLength(1);
  });
  it('says why it failed', async () => {
    expect(await searchRecipes('', null, 0, () => ({}), (async () => new Response('', { status: 401 })) as unknown as typeof fetch)).toEqual({ ok: false, reason: 'refused' });
    expect(await searchRecipes('', null, 0, () => ({}), ok({ nope: 1 }))).toEqual({ ok: false, reason: 'unreachable' });
  });
});
