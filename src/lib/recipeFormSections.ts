// The recipe form's folding sections (brief recipe-form-sections): which section owns which field, what a folded section says about itself, and
// which section opens when Save finds a problem. Pure, so the component only keeps the open state and moves focus.

export type FormSection = 'basics' | 'ing' | 'steps' | 'nut' | 'more';
export type FormField = 'name' | 'uses' | 'counts' | 'cat' | 'servings' | 'minutes' | 'ingredients' | 'steps' | 'serving' | 'servingG' | 'kcal' | 'protein' | 'carbs' | 'fat' | 'tags' | 'note' | 'url';

export const FORM_SECTIONS: readonly { id: FormSection; title: string }[] = [
  { id: 'basics', title: 'Basics' },
  { id: 'ing', title: 'Ingredients' },
  { id: 'steps', title: 'Steps' },
  { id: 'nut', title: 'Nutrition per serving' },
  { id: 'more', title: 'Tags, note and video' },
];

const OWNER: Record<FormField, FormSection> = {
  name: 'basics', uses: 'basics', counts: 'basics', cat: 'basics', servings: 'basics', minutes: 'basics',
  ingredients: 'ing', steps: 'steps',
  serving: 'nut', servingG: 'nut', kcal: 'nut', protein: 'nut', carbs: 'nut', fat: 'nut',
  tags: 'more', note: 'more', url: 'more',
};

/** The section that holds a field. */
export const sectionOf = (field: FormField): FormSection => OWNER[field];

/** A new recipe opens with Basics unfolded and the rest folded. */
export const initialOpen = (): ReadonlySet<FormSection> => new Set<FormSection>(['basics']);

/** The open sections after Save finds a problem in `field`: the section that holds it is unfolded, the others stay as they are. */
export const unfoldFor = (open: ReadonlySet<FormSection>, field: FormField): ReadonlySet<FormSection> => new Set([...open, sectionOf(field)]);

/** The open sections after a header is pressed. */
export const toggled = (open: ReadonlySet<FormSection>, id: FormSection): ReadonlySet<FormSection> => {
  const next = new Set(open);
  if (!next.delete(id)) next.add(id);
  return next;
};

export type SectionFacts = {
  name: string;
  catLabel: string;
  servings: number | undefined;
  ingredients: number; // lines with a name
  steps: number; // non-empty lines
  nutLine: string; // 'Not set' or '320 kcal · 24 g protein'
  tags: number;
  hasNote: boolean;
  hasVideo: boolean;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What a folded section shows after its title ("Ingredients" + "5"). */
export const sectionSummary = (id: FormSection, f: SectionFacts): string => {
  switch (id) {
    case 'basics': {
      const parts = [f.name.trim(), f.catLabel, f.servings ? plural(f.servings, 'serving') : ''].filter(Boolean);
      return f.name.trim() ? parts.join(' · ') : 'Name needed';
    }
    case 'ing': return f.ingredients ? String(f.ingredients) : 'None yet';
    case 'steps': return f.steps ? String(f.steps) : 'None yet';
    case 'nut': return f.nutLine;
    case 'more': {
      const parts = [f.tags ? plural(f.tags, 'tag') : '', f.hasNote ? 'note' : '', f.hasVideo ? 'video' : ''].filter(Boolean);
      return parts.length ? parts.join(' · ') : 'Optional';
    }
  }
};
