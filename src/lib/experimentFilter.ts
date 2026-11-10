/* The search over an Experiments list: it appears once the list is long enough to need it, and matches the name or the note. */
export const FILTER_AT = 6; // entries; at or below this the list is short enough to see whole

export const hasFilter = (count: number) => count > FILTER_AT;

export function matchesQuery(q: string, ...texts: (string | undefined)[]) {
  const needle = q.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!needle) return true;
  return texts.some(t => (t || '').toLowerCase().replace(/\s+/g, ' ').includes(needle));
}

/* The Ideas to try filters (Workout board only): Status and Muscle, AND-ed with the search text. */
export type IdeaStatus = '' | 'noday' | 'onday' | 'neverlogged';
export const IDEA_STATUS: { value: Exclude<IdeaStatus, ''>; label: string }[] = [
  { value: 'noday', label: 'Not on a day yet' },
  { value: 'onday', label: 'On a day this week' },
  { value: 'neverlogged', label: 'Never logged' },
];

type StatusFacts = { onDays: number[]; neverLogged: boolean };

/** The idea's status as the single choices a person picks; they are independent, so an idea can match more than one. */
export const matchesStatus = (status: IdeaStatus, f: StatusFacts) =>
  status === '' || (status === 'noday' ? f.onDays.length === 0 : status === 'onday' ? f.onDays.length > 0 : f.neverLogged);

/** An idea with no muscle tags matches no muscle, only All. */
export const matchesMuscle = (muscle: string, muscles: string[]) => muscle === '' || muscles.includes(muscle);

/** The muscles present among `lists` (one list per idea), in the order of `order`, so the choices do not change as the list narrows. */
export const musclesPresent = <T extends string>(lists: T[][], order: T[]) => order.filter(m => lists.some(l => l.includes(m)));

/** The one status label a card shows: the days it is on, else Never logged, else Not on a day yet. */
export const statusLabel = (f: StatusFacts) =>
  f.onDays.length ? `On Day ${f.onDays.join(', ')}` : f.neverLogged ? 'Never logged' : 'Not on a day yet';


/** Every muscle an exercise trains, primary first (the Muscle filter matches either). */
export const muscleKeys = <T extends string>(tags: { p?: T[]; s?: T[] } | null | undefined): T[] => [...(tags?.p || []), ...(tags?.s || [])];
/** The primary muscles a card shows: the first two. */
export const cardMuscles = <T extends string>(tags: { p?: T[] } | null | undefined): T[] => (tags?.p || []).slice(0, 2);
