// How many exercises a day of a program has: a superset counts as its exercises (two for a pair), every other card as one (an either/or card
// is one exercise whichever option is chosen). The Board's day tabs count the same way (`unitsOf` in logic.ts); this one needs no week.
export const exerciseCount = (slots: { type?: string; items: unknown[] }[]): number =>
  slots.reduce((n, s) => n + (s.type === 'superset' ? s.items.length : 1), 0);

// The Program editor's Day picker line, e.g. "Day 3 of 7 · 6 exercises" ("1 exercise" for one).
export const dayPickLabel = (day: number, total: number, count: number): string => `Day ${day} of ${total} · ${count} ${count === 1 ? 'exercise' : 'exercises'}`;
