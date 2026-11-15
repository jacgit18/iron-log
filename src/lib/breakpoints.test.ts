import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BREAKPOINTS, isAllowedWidth, widthsIn } from './breakpoints.js';

const SRC = join(__dirname, '..');

// Widths in files that another running piece of work owns, or the owner's hands-off areas, with the work that moves them. Each is a width outside the set today; the test
// fails when one of these stops being true (so a moved file is taken off the list) and when a file not on the list uses a width outside the set.
const OWED: Record<string, number[]> = {
  'styles.css': [1870], // the Board's seven days from a 1920 px screen with its scrollbar: hands off, stays
  'components/board/DayHeader.css': [320], // the Board's day header (20em): hands off, stays
  'components/nutritionBoard/NutritionBoard.css': [699], // slice 6 (700 / 701 with the phone header)
  'components/nutritionBoard/useWideBoard.ts': [699], // slice 6, with NutritionBoard.css: the phone header hook reads the same break
  'components/recipes/RecipeDesktop.css': [641, 1024], // slice 6
  'components/recipes/RecipeDetail.css': [641], // slice 6
  'components/recipes/Recipes.css': [640], // slice 6
  'components/settings/Settings.css': [600, 900, 901], // slice 6 (the file is owned by the chips and Nutrition items builds until they merge)
  'components/settings/Settings.tsx': [901], // slice 6, with Settings.css
  'components/supplements/PortionStepper.css': [420], // slice 6
  'components/grocery/ToGet.tsx': [1100], // not in a slice row: the Groceries rail, moves to 1000 / 1280 when Groceries is swept
  'components/grocery/AtHome.tsx': [1100], // same
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(css|tsx?)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

const outliers = (text: string): number[] => [...new Set(widthsIn(text).filter(w => !isAllowedWidth(w)))].sort((a, b) => a - b);

describe('breakpoints', () => {
  it('lists the widths in order, each a min-width and the max-width one below it', () => {
    expect([...BREAKPOINTS]).toEqual([...BREAKPOINTS].sort((x, y) => x - y));
    expect(new Set(BREAKPOINTS).size).toBe(BREAKPOINTS.length);
  });

  it('reads widths from media queries, matchMedia strings and useMinWidth calls', () => {
    expect(widthsIn('@media (max-width:700px) { a { b: c } }')).toEqual([700]);
    expect(widthsIn('@media (min-width: 20em) and (max-width: 40rem) {')).toEqual([320, 640]);
    expect(widthsIn("window.matchMedia('(min-width:1000px)').matches")).toEqual([1000]);
    expect(widthsIn('const rail = useMinWidth(1100);')).toEqual([1100]);
    expect(widthsIn('@media (width >= 700px) and (width < 40rem) {')).toEqual([700, 640]);
    expect(widthsIn('@media (650px <= width <= 1000px) {')).toEqual([650, 1000]);
    expect(widthsIn('@container (max-width: 15rem) { a { b: c } }')).toEqual([]);
    expect(widthsIn("matchMedia('(prefers-reduced-motion: reduce)')")).toEqual([]);
  });

  it('refuses a width outside the set (699 fails, 700 passes)', () => {
    expect(outliers('@media (max-width:699px) { a { b: c } }')).toEqual([699]);
    expect(outliers('@media (max-width:700px) { a { b: c } }')).toEqual([]);
    expect(outliers("matchMedia('(min-width:900px)')")).toEqual([900]);
  });

  it('keeps every stylesheet and component on the set, except the files listed as owed', () => {
    const found: Record<string, number[]> = {};
    for (const file of sourceFiles(SRC)) {
      const out = outliers(readFileSync(file, 'utf8'));
      if (out.length) found[relative(SRC, file).split('\\').join('/')] = out;
    }
    expect(found).toEqual(OWED);
  });
});
