#!/usr/bin/env node
// Builds a pull request description from .github/pull_request_template.md, with the Audience box already ticked, so the "PR audience"
// check (.github/workflows/pr-audience.yml) passes without anyone remembering it. The template stays the one source of the wording.
//
//   node scripts/pr-body.mjs --what "One paragraph on what changed and why" > /tmp/body.md
//   gh pr create --title "..." --body-file /tmp/body.md
//
// The audience is worked out from the diff against origin/main (the reason goes to stderr), and --audience na|admin|everyone overrides it:
//   na        every changed file is a doc, test, script, tool, CI or config file: nothing a user can see
//   admin     the diff adds an admin-only line (key: 'admin') to src/features.ts, or touches server/admin.ts
//   everyone  anything else under src/, server/ or public/ (the standing rule: new features ship to everyone for now, see CLAUDE.md)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LABELS = { na: 'n/a:', admin: '**Admin only**', everyone: '**Everyone**' };
const NOT_USER_FACING = [/^docs\//, /^\.githooks\//, /^e2e[\w-]*\//, /^scripts\//, /^tools\//, /^\.github\//, /^\.claude\//, /^spike\//, /^db\//, /^backups?\//, /\.test\.[jt]sx?$/, /\.md$/, /^package(-lock)?\.json$/, /^tsconfig[\w.]*\.json$/, /^vite\.config\./, /^playwright[\w.]*\.config\./, /^Dockerfile$/, /^cloudbuild[\w-]*\.yaml$/, /^docker-compose\.yml$/];

/** Which audience a change has, from its file names and its diff text. Returns { audience, reason }. */
export function inferAudience(files, diff = '') {
  if (files.length > 0 && files.every(f => NOT_USER_FACING.some(re => re.test(f)))) return { audience: 'na', reason: 'only docs, tests, scripts, CI or config files changed' };
  if (/^\+\s*\w+:\s*'admin'/m.test(diff) || files.includes('server/admin.ts')) return { audience: 'admin', reason: "an admin-only entry in src/features.ts, or server/admin.ts, changed" };
  return { audience: 'everyone', reason: 'user-visible files changed and no admin-only entry was added (standing rule: ship to everyone for now)' };
}

/** True when the change can move a Lighthouse score: UI code, styles, fonts, images, the page shell or the build config. */
export const touchesUi = files => files.some(f => /^src\/(components|hooks|assets)\//.test(f) || /\.(css|tsx|svg|png|webp|woff2?)$/.test(f) || f === 'index.html' || /^vite\.config\./.test(f) || f.startsWith('public/'));

/** The template with exactly one Audience box ticked and the What section filled in. A change that touches no UI (`ui` false) also gets the Lighthouse line under Checks ticked, since the line reads n/a then; for a UI change it stays open for the author to tick after running `scripts/lighthouse.mjs`, because that run is theirs to do. */
export function buildBody(template, audience, what = '', ui = false) {
  let inAudience = false;
  const out = template.split('\n').map(line => {
    if (/^## /.test(line)) inAudience = /^## Audience/.test(line);
    if (inAudience && /^- \[ \]/.test(line)) return line.includes(LABELS[audience]) ? line.replace('- [ ]', '- [x]') : line;
    if (!ui && /^- \[ \].*lighthouse\.mjs/i.test(line)) return line.replace('- [ ]', '- [x]'); // not a UI change: n/a, as the line says
    return line;
  }).join('\n');
  const body = what ? out.replace(/^## What and why\n\n/m, () => `## What and why\n\n${what.trim()}\n`) : out;
  const audienceSection = body.split('\n').reduce((acc, line) => { if (/^## /.test(line)) acc.on = /^## Audience/.test(line); if (acc.on) acc.lines.push(line); return acc; }, { on: false, lines: [] }).lines;
  if (audienceSection.filter(l => /^- \[x\]/i.test(l)).length !== 1) throw new Error('The template has no Audience box matching ' + audience);
  return body;
}

function main(argv) {
  const arg = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8' });
  const base = ['origin/main', 'main'].find(b => { try { git('rev-parse', '--verify', b); return true; } catch { return false; } }) || 'HEAD';
  const files = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean);
  const diff = git('diff', '-U0', `${base}...HEAD`, '--', 'src/features.ts');
  const given = arg('--audience');
  if (given && !LABELS[given]) { console.error('--audience must be na, admin or everyone'); process.exit(2); }
  const found = given ? { audience: given, reason: 'given with --audience' } : inferAudience(files, diff);
  console.error(`Audience: ${found.audience} (${found.reason}). ${files.length} file(s) against ${base}.`);
  const template = readFileSync(fileURLToPath(new URL('../.github/pull_request_template.md', import.meta.url)), 'utf8');
  process.stdout.write(buildBody(template, found.audience, arg('--what'), touchesUi(files)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
