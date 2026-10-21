#!/usr/bin/env node
// Builds a pull request description from .github/pull_request_template.md, with the Audience box already ticked, so the "PR audience"
// check (.github/workflows/pr-audience.yml) passes without anyone remembering it. The template stays the one source of the wording.
//
//   node scripts/pr-body.mjs --what "One paragraph on what changed and why" > /tmp/body.md
//   (the Changelog section is filled from --what, or from --changelog "..." when it should say less)
//   --brief <path or "n/a: why">   fills the Delivery section's Brief line (feature-delivery.md: one brief, one branch, one PR)
//   --split "<reason>"             fills "Split because:" when the feature is not this PR alone (the reasons are in feature-delivery.md)
//   gh pr create --title "..." --body-file /tmp/body.md
//
// The audience is worked out from the diff against origin/main (the reason goes to stderr), and --audience <key> overrides it:
//   na        every changed file is a doc, test, script, tool, CI or config file: nothing a user can see
//   <rules>   each rule in .github/pr-kit.json "audiences", in order (a changed file, or a line added to a file's diff)
//   everyone  anything else
// This script is the same in every project; what differs lives in .github/pr-kit.json (all keys optional, see DEFAULTS below) and in the
// template's Audience and Checks lines. Every audience's label must appear in exactly one Audience box of the template.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// A key set in .github/pr-kit.json replaces that key's default entirely (it does not add to it), so a project that sets `notUserFacing` or `ui` lists every pattern.
const DEFAULTS = {
  // Paths that can never change what a user sees (regex source strings).
  notUserFacing: ['^docs?/', '^tests?/', '^e2e[\\w-]*/', '^scripts/', '^tools/', '^\\.github/', '^\\.githooks/', '^\\.husky/', '^\\.claude/', '\\.(test|spec)\\.[jt]sx?$', '\\.md$', '^package(-lock)?\\.json$', '^tsconfig[\\w.]*\\.json$', '^Dockerfile$', '^docker-compose\\.ya?ml$'],
  // Extra audiences, checked in order after n/a: { key, label, files?: [paths], diffFile?, diffPattern? (regex source, multiline), reason }.
  audiences: [],
  // Paths that can move a Lighthouse score or look of the page (regex source strings).
  ui: ['\\.(css|tsx|jsx|vue|svelte|svg|png|webp|woff2?)$', '^index\\.html$', '^public/'],
  // A Checks line (regex source, case-insensitive) that is ticked for a change that touches no UI, because it reads n/a then. Empty: none.
  autoTickWhenNoUi: '',
  // Reason shown for the fallback audience.
  everyoneReason: 'user-visible files changed and no other audience rule matched',
};
const BUILT_IN_LABELS = { na: 'n/a:', everyone: '**Everyone**' };

/** The project's settings: DEFAULTS with whatever .github/pr-kit.json sets. */
export function loadConfig(path = fileURLToPath(new URL('../.github/pr-kit.json', import.meta.url))) {
  return { ...DEFAULTS, ...(existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}) };
}

const any = (patterns, f, flags = '') => patterns.some(p => new RegExp(p, flags).test(f));
export const labelsOf = config => ({ ...BUILT_IN_LABELS, ...Object.fromEntries(config.audiences.map(a => [a.key, a.label])) });

/** Which audience a change has, from its file names and its diffs (`diffs` maps a file name to its added/removed lines). Returns { audience, reason }. */
export function inferAudience(files, diffs = {}, config = loadConfig()) {
  if (files.length > 0 && files.every(f => any(config.notUserFacing, f))) return { audience: 'na', reason: 'only docs, tests, scripts, CI or config files changed' };
  for (const a of config.audiences) {
    const byFile = (a.files || []).some(f => files.includes(f));
    const byDiff = a.diffFile && a.diffPattern && new RegExp(a.diffPattern, 'm').test(diffs[a.diffFile] || '');
    if (byFile || byDiff) return { audience: a.key, reason: a.reason };
  }
  return { audience: 'everyone', reason: config.everyoneReason };
}

/** True when the change can move a Lighthouse score: UI code, styles, fonts, images, the page shell or the build config. */
export const touchesUi = (files, config = loadConfig()) => files.some(f => any(config.ui, f));

/** A changelog entry from a long description: whole sentences up to 600 characters, never cut mid-word. */
export function shorten(text, max = 600) {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > 0 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(' ')) + '…';
}

/** The template with exactly one Audience box ticked and the What section filled in. A change that touches no UI (`ui` false) also gets the config's `autoTickWhenNoUi` Checks line ticked (the Lighthouse line in iron-log, which reads n/a then); for a UI change it stays open for the author to tick after running the check, because that run is theirs to do. */
export function buildBody(template, audience, what = '', ui = false, changelog = '', config = loadConfig(), delivery = {}) {
  const labels = labelsOf(config);
  const auto = config.autoTickWhenNoUi ? new RegExp(config.autoTickWhenNoUi, 'i') : null;
  let inAudience = false;
  const out = template.split('\n').map(line => {
    if (/^## /.test(line)) inAudience = /^## Audience/.test(line);
    if (inAudience && /^- \[ \]/.test(line)) return line.includes(labels[audience]) ? line.replace('- [ ]', '- [x]') : line;
    if (!ui && auto && /^- \[ \]/.test(line) && auto.test(line)) return line.replace('- [ ]', '- [x]'); // not a UI change: n/a, as the line says
    return line;
  }).join('\n');
  const entry = changelog ? changelog.trim().replace(/\s+/g, ' ') : shorten(what);
  const withLog = entry ? out.replace(/^(## Changelog\n\n)((?:<!--[\s\S]*?-->\n)?)/m, (_, h, c) => `${h}${c}${entry}\n`) : out;
  const withWhat = what ? withLog.replace(/^## What and why\n\n/m, () => `## What and why\n\n${what.trim()}\n`) : withLog;
  const oneLine = t => t.trim().replace(/\s+/g, ' ');
  const withBrief = delivery.brief ? withWhat.replace(/^Brief:.*$/m, () => `Brief: ${oneLine(delivery.brief)}`) : withWhat;
  const body = delivery.split ? withBrief.replace(/^Split because:.*$/m, () => `Split because: ${oneLine(delivery.split)}`) : withBrief;
  const audienceSection = body.split('\n').reduce((acc, line) => { if (/^## /.test(line)) acc.on = /^## Audience/.test(line); if (acc.on) acc.lines.push(line); return acc; }, { on: false, lines: [] }).lines;
  if (audienceSection.filter(l => /^- \[x\]/i.test(l)).length !== 1) throw new Error('The template has no Audience box matching ' + audience);
  return body;
}

/** Warnings for the Delivery section (feature-delivery.md). Advisory: they print to stderr and never stop the PR. */
export function deliveryWarnings({ brief, split, changed = 0, openPrs = 0 }) {
  const w = [];
  if (!brief) w.push('Delivery: no --brief given. Pass the feature brief path, or --brief "n/a: <why>" for a change that needs none.');
  if (!split && openPrs > 0 && changed > 0 && changed < 40) w.push(`Delivery: ${changed} changed lines while ${openPrs} other PR(s) of yours are open. Fold this into that feature's PR, or say why with --split "<reason>".`);
  return w;
}

const changedLines = (git, base) => { try { return git('diff', '--numstat', `${base}...HEAD`).split('\n').filter(Boolean).reduce((n, l) => n + (parseInt(l, 10) || 0) + (parseInt(l.split('\t')[1], 10) || 0), 0); } catch { return 0; } };
const otherOpenPrs = git => { try { const branch = git('branch', '--show-current').trim(); return JSON.parse(execFileSync('gh', ['pr', 'list', '--author', '@me', '--state', 'open', '--json', 'headRefName'], { encoding: 'utf8', timeout: 8000 })).filter(p => p.headRefName !== branch).length; } catch { return 0; } };

function main(argv) {
  const arg = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8' });
  const config = loadConfig();
  const labels = labelsOf(config);
  const base = ['origin/main', 'main'].find(b => { try { git('rev-parse', '--verify', b); return true; } catch { return false; } }) || 'HEAD';
  const files = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean);
  const diffs = Object.fromEntries([...new Set(config.audiences.map(a => a.diffFile).filter(Boolean))].map(f => [f, git('diff', '-U0', `${base}...HEAD`, '--', f)]));
  const given = arg('--audience');
  if (given && !labels[given]) { console.error(`--audience must be one of: ${Object.keys(labels).join(', ')}`); process.exit(2); }
  const found = given ? { audience: given, reason: 'given with --audience' } : inferAudience(files, diffs, config);
  console.error(`Audience: ${found.audience} (${found.reason}). ${files.length} file(s) against ${base}.`);
  const template = readFileSync(fileURLToPath(new URL('../.github/pull_request_template.md', import.meta.url)), 'utf8');
  if (!arg('--changelog') && arg('--what')) console.error('No --changelog given: the Changelog section is the --what text (cut at a sentence end past 600 characters). Pass --changelog "..." to say it shorter.');
  for (const w of deliveryWarnings({ brief: arg('--brief'), split: arg('--split'), changed: changedLines(git, base), openPrs: otherOpenPrs(git) })) console.error(w);
  process.stdout.write(buildBody(template, found.audience, arg('--what'), touchesUi(files, config), arg('--changelog'), config, { brief: arg('--brief'), split: arg('--split') }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
