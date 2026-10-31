// Fails on a new bare `.localeCompare(` inside a `.sort(` in src/: list order comes from src/lib/sort.ts (nameCmp, byName, sortByName),
// so equal names keep a fixed order and every list agrees on case, accents and digits. A localeCompare given options is already a
// deliberate compare and passes. A deliberate exception (ISO date strings, ids, sync table names) takes a comment on a line of the sort,
// or on a comment-only line right above it: // sort-ok: why
// Only comparators written inline in .sort( are seen: one kept in a variable (const newest = (a, b) => ...; list.sort(newest)) gets past the guard,
// so keep a list's comparator inline or build it with nameCmp.
// Usage: node scripts/check-sorts.mjs   (run by npm run lint)
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Text of the balanced parentheses that open at `open` (the index of the "("); null if they never close. */
function balanced(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return text.slice(open + 1, i);
  }
  return null;
}

/** True when the arguments have a top-level comma (so `localeCompare(b, undefined, { sensitivity })` is not bare). */
function hasSecondArg(args) {
  let depth = 0;
  for (const c of args) {
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) return true;
  }
  return false;
}

/** Findings in one file's text: [{ line, text }] for each bare localeCompare inside a .sort( without sort-ok. */
export function findBareSorts(text) {
  const lines = text.split('\n');
  const lineOf = idx => text.slice(0, idx).split('\n').length;
  const found = [];
  for (const m of text.matchAll(/\.sort\(/g)) {
    const open = m.index + m[0].length - 1;
    const body = balanced(text, open);
    if (body === null) continue;
    const first = lineOf(open), last = lineOf(open + body.length);
    // sort-ok counts inside this sort's own lines, or on the line above when that line is only a comment (so it cannot cover the next sort too).
    if (/sort-ok/.test(lines.slice(first - 1, last).join('\n')) || /^\s*\/\/.*sort-ok/.test(lines[first - 2] ?? '')) continue;
    for (const c of body.matchAll(/\.localeCompare\(/g)) {
      const args = balanced(body, c.index + c[0].length - 1);
      if (args !== null && !hasSecondArg(args)) { found.push({ line: first + body.slice(0, c.index).split('\n').length - 1, text: lines[first + body.slice(0, c.index).split('\n').length - 2].trim() }); break; }
    }
  }
  return found;
}

async function sources(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await sources(p));
    else if (/\.(ts|tsx|js|jsx)$/.test(ent.name) && !/\.test\.[jt]sx?$/.test(ent.name)) out.push(p);
  }
  return out.sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = [];
  for (const file of await sources(join(ROOT, 'src'))) {
    for (const f of findBareSorts(await readFile(file, 'utf8'))) problems.push(`${relative(ROOT, file)}:${f.line}  ${f.text.slice(0, 110)}`);
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    console.error(`\n${problems.length} sort(s) with a bare localeCompare. Use nameCmp / byName / sortByName from src/lib/sort.ts, or add // sort-ok: why.`);
    process.exit(1);
  }
}
