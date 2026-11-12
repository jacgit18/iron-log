import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every screen that words a food's numbers calls `macroLine` (brief shared-macro-line-and-two-tap-removes). This greps the components for the old hand-built text.
const ROOT = join(__dirname, '..', 'components');

/** Source text with a hand-built number line: "kcal · ${x} g protein" or the lower-case missing text. */
const HAND_BUILT: RegExp[] = [/kcal\s*·\s*\$\{[^}]*\}\s*g protein/, /\}\s*g protein\b/, /needs numbers/];

function offences(text: string): string[] {
  return HAND_BUILT.filter(re => re.test(text)).map(re => String(re));
}

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));
}

describe('macroLine callers', () => {
  it('flags the old hand-built patterns (fixture)', () => {
    expect(offences('`${r.kcal} kcal · ${r.p} g protein`')).not.toEqual([]);
    expect(offences("const s = 'needs numbers';")).not.toEqual([]);
    expect(offences('const s = macroLine(r) || "Needs numbers";')).toEqual([]);
  });

  it('finds none in src/components', () => {
    const bad = files(ROOT).flatMap(f => offences(readFileSync(f, 'utf8')).map(p => `${f.slice(ROOT.length + 1)}: ${p}`));
    expect(bad).toEqual([]);
  });
});
