// Compares two folders of screenshots and writes a Markdown report for a pull request.
// Usage: node tools/visual-diff.mjs <baseDir> <headDir> <outDir> <imageUrlPrefix>
// outDir gets before-/after-/diff- copies of every changed image, plus comment.md pointing at them.
import { readdir, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const [baseDir, headDir, outDir, urlPrefix = ''] = process.argv.slice(2);
if (!baseDir || !headDir || !outDir) { console.error('usage: visual-diff.mjs <baseDir> <headDir> <outDir> [urlPrefix]'); process.exit(2); }

const pngs = async dir => (await readdir(dir).catch(() => [])).filter(f => f.endsWith('.png')).sort();
const load = async f => PNG.sync.read(await readFile(f));
await mkdir(outDir, { recursive: true });

const base = new Set(await pngs(baseDir));
const rows = [];
for (const name of await pngs(headDir)) {
  const head = await load(join(headDir, name));
  if (!base.has(name)) { await copyFile(join(headDir, name), join(outDir, `after-${name}`)); rows.push({ name, kind: 'new' }); continue; }
  const before = await load(join(baseDir, name));
  if (before.width !== head.width || before.height !== head.height) {
    await copyFile(join(baseDir, name), join(outDir, `before-${name}`)); await copyFile(join(headDir, name), join(outDir, `after-${name}`));
    rows.push({ name, kind: 'resized', note: `${before.width}×${before.height} → ${head.width}×${head.height}` }); continue;
  }
  const diff = new PNG({ width: head.width, height: head.height });
  const n = pixelmatch(before.data, head.data, diff.data, head.width, head.height, { threshold: 0.1 });
  if (!n) continue;
  await writeFile(join(outDir, `diff-${name}`), PNG.sync.write(diff));
  await copyFile(join(baseDir, name), join(outDir, `before-${name}`)); await copyFile(join(headDir, name), join(outDir, `after-${name}`));
  rows.push({ name, kind: 'changed', note: `${(n / (head.width * head.height) * 100).toFixed(2)}% of pixels differ` });
}
for (const name of base) if (!(await pngs(headDir)).includes(name)) rows.push({ name, kind: 'removed' });

const img = f => `<img src="${urlPrefix}${f}" width="320">`;
const lines = ['<!-- visual-diff -->', '### Screenshot changes', ''];
if (!rows.length) lines.push('No visual changes against `main`.');
else {
  lines.push(`${rows.length} image${rows.length > 1 ? 's' : ''} differ from \`main\`. Unexpected? Check the diff column.`, '');
  for (const r of rows) {
    lines.push(`<details open><summary><b>${r.name}</b> · ${r.kind}${r.note ? ` · ${r.note}` : ''}</summary>`, '');
    if (r.kind === 'new') lines.push('| After |', '|---|', `| ${img(`after-${r.name}`)} |`);
    else if (r.kind === 'removed') lines.push('Removed from `docs/images`.');
    else if (r.kind === 'resized') lines.push('| Before | After |', '|---|---|', `| ${img(`before-${r.name}`)} | ${img(`after-${r.name}`)} |`);
    else lines.push('| Before | After | Diff |', '|---|---|---|', `| ${img(`before-${r.name}`)} | ${img(`after-${r.name}`)} | ${img(`diff-${r.name}`)} |`);
    lines.push('', '</details>', '');
  }
}
await writeFile(join(outDir, 'comment.md'), lines.join('\n'));
console.log(`${rows.length} changed`);
