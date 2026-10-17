// Fails when a stylesheet uses a raw font size, corner radius or z-index where a design token exists (the scales are at the top of src/styles.css).
// Allowed raw values: display sizes of 2rem and up, a radius of 5px or less (chart marks and bars), 50% or 0, and z-index 0 to 2 (local stacking).
// A deliberate exception takes a comment right above it: /* token-ok: why */
// Usage: node scripts/check-css-tokens.mjs   (run by npm run lint)
import postcss from 'postcss';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

async function cssFiles(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await cssFiles(p));
    else if (ent.name.endsWith('.css')) out.push(p);
  }
  return out.sort();
}

const px = v => [...v.matchAll(/(-?[\d.]+)px/g)].map(m => Number(m[1]));
const rules = {
  'font-size': v => /^var\(--fs-[a-z0-9-]+\)$/.test(v) || /^(max|clamp)\(/.test(v) || /^(inherit|initial)$/.test(v) || /^[\d.]+(em|%)$/.test(v) || (/^[\d.]+rem$/.test(v) && parseFloat(v) >= 2),
  'border-radius': v => /var\(--r-[a-z]+\)/.test(v) || /^(0|50%|inherit)$/.test(v) || (px(v).length > 0 && px(v).every(n => n <= 5) && !/[a-z(]/.test(v.replace(/px/g, ''))),
  'z-index': v => /^var\(--z-[a-z-]+\)$/.test(v) || /^(auto|-1|0|1|2)$/.test(v),
};
const hint = { 'font-size': 'a --fs-* token', 'border-radius': 'a --r-* token', 'z-index': 'a --z-* token' };

const problems = [];
for (const file of await cssFiles(join(ROOT, 'src'))) {
  const root = postcss.parse(await readFile(file, 'utf8'), { from: file });
  root.walkDecls(d => {
    const ok = rules[d.prop];
    if (!ok || d.parent.selector?.startsWith(':root')) return;
    const prev = d.prev();
    if (prev?.type === 'comment' && /token-ok/.test(prev.text)) return;
    if (!ok(d.value.trim())) problems.push(`${relative(ROOT, file)}:${d.source.start.line}  ${d.prop}: ${d.value}  (use ${hint[d.prop]}, or /* token-ok: why */ above it)`);
  });
}
if (problems.length) { console.error(problems.join('\n')); console.error(`\n${problems.length} raw value(s). The scales are at the top of src/styles.css.`); process.exit(1); }
