// Formats the app's stylesheets with one rule per line and one property per line, so two pull requests that change
// different properties of the same rule, or add rules near each other, touch different lines and merge without a conflict.
// Only whitespace changes: the built (minified) CSS is the same before and after.
// Usage: node scripts/format-css.mjs           rewrite every .css file under src/
//        node scripts/format-css.mjs --check   list the files that are not formatted and exit 1 (run by npm run lint)
import postcss from 'postcss';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const check = process.argv.includes('--check');

async function cssFiles(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await cssFiles(p));
    else if (ent.name.endsWith('.css')) out.push(p);
  }
  return out.sort();
}

// A blank line in the source (between sections) is kept; everything else gets exactly one newline.
const gap = before => (/\n[ \t]*\n/.test(before || '') ? '\n\n' : '\n');

function layout(container, depth, wrapped = false) {
  const pad = '  '.repeat(depth);
  container.each((node, i) => {
    node.raws.before = (i === 0 && depth === 0 && !wrapped ? '' : i === 0 ? '\n' : gap(node.raws.before)) + pad;
    if (node.type === 'decl') {
      node.raws.between = ': ';
      if (node.important) node.raws.important = ' !important';
    } else if (node.type === 'rule' || (node.type === 'atrule' && node.nodes)) {
      node.raws.between = ' ';
      if (node.type === 'atrule') node.raws.afterName = node.params ? ' ' : '';
      node.raws.semicolon = true;
      // The one `@layer name { ... }` that wraps a whole file keeps its rules at the left edge, so adding the wrapper
      // does not re-indent (and re-blame) every line, and a later change to the file merges as it did before.
      const wrapper = depth === 0 && node.type === 'atrule' && node.name === 'layer' && node.nodes.length > 0;
      node.raws.after = node.nodes.length ? '\n' + pad : '';
      layout(node, wrapper ? 0 : depth + 1, wrapper);
    }
  });
}

export function format(css, from) {
  const root = postcss.parse(css, { from });
  layout(root, 0);
  root.raws.after = '\n';
  return root.toString();
}

const bad = [];
const unwrapped = [];

// The file's top level is exactly `@layer base, components;` and one `@layer <want> { ... }` block: a rule outside the block
// would be unlayered and outrank both layers.
function wrapperProblem(css, want, from) {
  const top = postcss.parse(css, { from }).nodes.filter(n => n.type !== 'comment');
  const [order, block] = top;
  const ok = top.length === 2 && order.type === 'atrule' && order.name === 'layer' && !order.nodes && order.params.replace(/\s+/g, '') === 'base,components'
    && block.type === 'atrule' && block.name === 'layer' && !!block.nodes && block.params === want;
  return ok ? '' : `needs \`@layer base, components;\` then one \`@layer ${want} { ... }\` holding every rule`;
}
for (const file of await cssFiles(join(ROOT, 'src'))) {
  const src = await readFile(file, 'utf8');
  const out = format(src, file);
  // Every stylesheet is one layer: styles.css is `base`, every component file is `components` (see CLAUDE.md, Styles).
  const want = file.endsWith('/src/styles.css') ? 'base' : 'components';
  const problem = wrapperProblem(src, want, file);
  if (problem) unwrapped.push(`${relative(ROOT, file)}: ${problem}`);
  if (out === src) continue;
  if (check) bad.push(relative(ROOT, file));
  else await writeFile(file, out);
}
if (unwrapped.length) console.error(`Not in a cascade layer (add the wrapper by hand, the formatter does not):\n  ${unwrapped.join('\n  ')}`);
if (bad.length) console.error(`Not formatted (run node scripts/format-css.mjs): ${bad.join(', ')}`);
if (bad.length || unwrapped.length) process.exit(1);
