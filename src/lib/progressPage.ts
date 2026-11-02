// Progress on one page (wide screens): the sections down the page, the rail that jumps to them, and how each maps to an address. Pure, so the
// mapping is unit-tested; src/components/progress/OnePage.tsx does the DOM side.

/** The window width, in px, from which Progress is one page instead of a hub with drill-in pages. */
export const ONE_PAGE_MIN = 1280;

/** The sections in page order: id, rail label, and the `progress/<page>` address that opens it (null: no address of its own). */
export const SECTIONS = [
  { id: 'overview', label: 'Overview', page: null },
  { id: 'history', label: 'History', page: 'hist' },
  { id: 'muscles', label: 'Muscles', page: null },
  { id: 'goals', label: 'Goals', page: 'goals' },
  { id: 'freq', label: 'Frequency', page: 'freq' },
  { id: 'lifts', label: 'Exercises', page: 'lifts' },
  { id: 'trends', label: 'Trends', page: 'trends' },
  { id: 'body', label: 'Body weight', page: null },
] as const;
export type SectionId = (typeof SECTIONS)[number]['id'];

/** The section a `progress/<page>` address opens, or null for the plain Progress address. */
export const sectionOfPage = (page: string | null): SectionId | null => SECTIONS.find(s => s.page === page && page !== null)?.id ?? null;

/** The address for a section: `progress/hist` for History, plain `progress` when it has none of its own. */
export const pathOfSection = (id: SectionId): string => {
  const page = SECTIONS.find(s => s.id === id)?.page;
  return page ? `progress/${page}` : 'progress';
};

/** The section being read: the last whose top has scrolled up to `offset` px from the top of the window; the last one once the page is at its end. */
export function currentSection(tops: Readonly<Record<string, number | undefined>>, offset: number, atEnd: boolean): SectionId {
  if (atEnd) return SECTIONS[SECTIONS.length - 1].id;
  let cur: SectionId = SECTIONS[0].id;
  for (const { id } of SECTIONS) { const t = tops[id]; if (t !== undefined && t <= offset) cur = id; }
  return cur;
}

/** Whether there is anything to chart: a logged lift or a body weight. When not, the overview shows one empty tile. */
export const hasProgressData = (logs: Readonly<Record<string, readonly unknown[] | undefined>>, bodyCount: number): boolean =>
  bodyCount > 0 || Object.values(logs).some(l => !!l && l.length > 0);
