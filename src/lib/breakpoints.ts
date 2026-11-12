// The widths the layout may change at (design-language slice 4, ADR in DECISIONS.md). A media query, a `matchMedia` call or a `useMinWidth(px)` call uses one
// of these; `breakpoints.test.ts` scans the source and fails on any other width. A max-width is the min-width minus one (700 / 701), so a pair never overlaps or leaves a gap.
export const BREAKPOINTS = [380, 480, 560, 700, 701, 768, 1000, 1001, 1280, 1440, 1501, 1600] as const;

const ALLOWED: ReadonlySet<number> = new Set(BREAKPOINTS);

export const isAllowedWidth = (px: number): boolean => ALLOWED.has(px);

const EM_PX = 16;

// Every width a piece of source text sets in a media query, a `matchMedia('(...)')` string or a `useMinWidth(n)` call, in px (em and rem count as 16 px).
// An `@container` query is about a box, not the screen, so it is left out.
export function widthsIn(text: string): number[] {
  const out: number[] = [];
  const queries: string[] = [];
  for (const m of text.matchAll(/@media([^{]*)\{/g)) queries.push(m[1] ?? '');
  for (const m of text.matchAll(/matchMedia\(\s*(['"`])([^'"`]*)\1/g)) queries.push(m[2] ?? '');
  for (const q of queries) {
    for (const m of q.matchAll(/\(\s*(?:min|max)-width\s*:\s*([\d.]+)\s*(px|em|rem)?\s*\)/g)) {
      out.push(Math.round(Number(m[1]) * (m[2] === 'em' || m[2] === 'rem' ? EM_PX : 1)));
    }
  }
  for (const m of text.matchAll(/useMinWidth\(\s*(\d+)\s*\)/g)) out.push(Number(m[1]));
  return out;
}
