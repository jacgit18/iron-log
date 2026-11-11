import { describe, expect, it } from 'vitest';
import { FORM_SECTIONS, fieldForSaveError, initialOpen, sectionOf, sectionSummary, toggled, unfoldFor } from './recipeFormSections.js';
import type { FormField, SectionFacts } from './recipeFormSections.js';

const facts: SectionFacts = { name: 'Chili', catLabel: 'Dinner', servings: 4, ingredients: 5, steps: 3, nutLine: '320 kcal · 24 g protein', tags: 2, hasNote: true, hasVideo: false };

describe('which section owns which field', () => {
  it('puts every field in one of the five sections', () => {
    const fields: FormField[] = ['name', 'uses', 'counts', 'cat', 'servings', 'minutes', 'ingredients', 'steps', 'serving', 'servingG', 'kcal', 'protein', 'carbs', 'fat', 'tags', 'note', 'url'];
    const ids = FORM_SECTIONS.map(s => s.id);
    for (const f of fields) expect(ids).toContain(sectionOf(f));
  });
  it('maps the fields Save checks', () => {
    expect(sectionOf('servings')).toBe('basics');
    expect(sectionOf('minutes')).toBe('basics');
    expect(sectionOf('ingredients')).toBe('ing');
    expect(sectionOf('servingG')).toBe('nut');
    expect(sectionOf('kcal')).toBe('nut');
    expect(sectionOf('fat')).toBe('nut');
    expect(sectionOf('tags')).toBe('more');
    expect(sectionOf('url')).toBe('more');
  });
});

describe('which sections are open', () => {
  it('starts with Basics only', () => expect([...initialOpen()]).toEqual(['basics']));
  it('unfolds the section of a field with a problem and leaves the others', () => {
    expect([...unfoldFor(initialOpen(), 'kcal')].sort()).toEqual(['basics', 'nut']);
    expect([...unfoldFor(new Set(['nut']), 'kcal')]).toEqual(['nut']);
  });
  it('toggles one header without touching the input set', () => {
    const open = initialOpen();
    expect([...toggled(open, 'ing')].sort()).toEqual(['basics', 'ing']);
    expect([...toggled(open, 'basics')]).toEqual([]);
    expect([...open]).toEqual(['basics']);
  });
});

describe('folded summaries', () => {
  it('counts ingredients and steps', () => {
    expect(sectionSummary('ing', facts)).toBe('5');
    expect(sectionSummary('steps', facts)).toBe('3');
    expect(sectionSummary('ing', { ...facts, ingredients: 0 })).toBe('None yet');
    expect(sectionSummary('steps', { ...facts, steps: 0 })).toBe('None yet');
  });
  it('shows the nutrition line as it stands', () => {
    expect(sectionSummary('nut', facts)).toBe('320 kcal · 24 g protein');
    expect(sectionSummary('nut', { ...facts, nutLine: 'Not set' })).toBe('Not set');
  });
  it('summarises Basics by name, category and servings', () => {
    expect(sectionSummary('basics', facts)).toBe('Chili · Dinner · 4 servings');
    expect(sectionSummary('basics', { ...facts, servings: 1 })).toBe('Chili · Dinner · 1 serving');
    expect(sectionSummary('basics', { ...facts, name: '  ' })).toBe('Name needed');
  });
  it('lists what the last section holds', () => {
    expect(sectionSummary('more', facts)).toBe('2 tags · note');
    expect(sectionSummary('more', { ...facts, tags: 1, hasNote: false, hasVideo: true })).toBe('1 tag · video');
    expect(sectionSummary('more', { ...facts, tags: 0, hasNote: false })).toBe('Optional');
  });
});

describe('the field a save error is about', () => {
  it('maps the store sentences to the section to open', () => {
    expect(fieldForSaveError('Give the recipe a name.')).toBe('name');
    expect(fieldForSaveError('Add at least one ingredient.')).toBe('ingredients');
    expect(fieldForSaveError('Pasta already contains this meal, so that would loop.')).toBe('ingredients');
    expect(fieldForSaveError('You can use up to 40 different tags. Remove one from a recipe first.')).toBe('tags');
    expect(sectionOf(fieldForSaveError('You can keep up to 200 recipes. Delete one to add another.'))).toBe('basics');
  });
});
