#!/usr/bin/env node
// Accuracy run for the label photo scan (brief label-photo-scan, Done when 5). Not part of CI: it calls the real Claude API with your key and costs a
// fraction of a cent per photo. It runs the same prompt and validator the route uses (server/scan.ts), so what you see is what the app would fill.
//
//   ANTHROPIC_API_KEY=... npx tsx scripts/scan-eval.mjs [--model=claude-sonnet-5-5] photo1.jpg photo2.jpg ...
//   ... --expect=<file.json> checks each photo against what its label prints and ends with a PASS or FAIL verdict (scripts/lib/scanExpect.mjs says the file's shape); photos with no entry in it are only printed.
//   ANTHROPIC_API_KEY=... npx tsx scripts/scan-eval.mjs --supplement [--model=<id>] bottle1.jpg ...   (brief supplement-label-scan: the same prompt and validator as POST /api/scan/supplement;
//   photograph at least 8 of your own bottles, with IU, a blend, a gummy, a powder and a liquid among them, and compare every tracked amount with the bottle; the model and the result go in the PR)
//
// Each line now also shows the "micro" vitamin and mineral amounts (brief food-vitamins-minerals, Done when 7): compare them with the label too, per serving, and note how many labels
// had a wrong or invented amount (a wrong unit, a percent of Daily Value read as mg, a nutrient the label does not list); the kill criterion is in the brief.
// Compare each printed line with the label; the brief wants the calories and protein right on at least 9 of 10 real labels. Photos stay on your machine
// except for the call to Anthropic; nothing is written.
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { compareLabel, summarize } from './lib/scanExpect.mjs';
import { DEFAULT_MODEL, DEFAULT_SUPPLEMENT_MODEL, readLabel, readSupplement } from '../server/scan.ts';

const args = process.argv.slice(2);
const supplement = args.includes('--supplement');
const model = args.find(a => a.startsWith('--model='))?.slice(8) || (supplement ? process.env.SCAN_SUPPLEMENT_MODEL || DEFAULT_SUPPLEMENT_MODEL : process.env.SCAN_MODEL || DEFAULT_MODEL);
const expectFile = args.find(a => a.startsWith('--expect='))?.slice(9);
const files = args.filter(a => !a.startsWith('--'));
const key = process.env.ANTHROPIC_API_KEY;
if (!key || files.length === 0) {
  console.error('Usage: ANTHROPIC_API_KEY=... npx tsx scripts/scan-eval.mjs [--supplement] [--model=<id>] [--expect=<file.json>] <photo.jpg>...');
  process.exit(2);
}
console.log(`model: ${model}`);
if (expectFile && supplement) { console.error('--expect checks food labels: it cannot be used with --supplement.'); process.exit(2); }
let expected;
if (expectFile) {
  try { expected = JSON.parse(await readFile(expectFile, 'utf8')); } catch (err) { console.error(`Could not read the --expect file ${expectFile}: ${err instanceof Error ? err.message : 'unknown'}`); process.exit(2); }
  if (!expected?.files || typeof expected.files !== 'object') { console.error(`The --expect file ${expectFile} has no "files" object.`); process.exit(2); }
}
const rows = [];
for (const file of files) {
  const bytes = await readFile(file);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) { console.log(`${file}: not a JPEG, skipped (the app sends JPEG)`); continue; }
  try {
    const result = await (supplement ? readSupplement : readLabel)(fetch, key, model, bytes.toString('base64'));
    console.log(`${file}: ${JSON.stringify(result)}`);
    const spec = expected?.files?.[basename(file)];
    if (spec) { const c = compareLabel(result, spec); rows.push({ file, name: basename(file), spec, ...c }); console.log(`  ${c.pass ? 'PASS' : 'FAIL'} ${spec.note ?? ''}${c.problems.map(p => `\n    problem: ${p}`).join('')}${c.notes.map(n => `\n    note: ${n}`).join('')}`); }
  } catch (err) {
    console.log(`${file}: failed (${err instanceof Error ? err.message : 'unknown'})`);
    const spec = expected?.files?.[basename(file)];
    if (spec) rows.push({ file, name: basename(file), spec, pass: false, calProteinOk: spec.kind === 'label' ? false : null, problems: ['the scan call failed'], notes: [] });
  }
}
if (expected) {
  const s = summarize(rows, Object.keys(expected.files ?? {}));
  console.log(`\nSummary: calories and protein right on ${s.calOk} of ${s.real} real labels (at most ${s.allowedMisses} miss allowed); ${s.microProblems} wrong, percent-as-amount or invented vitamin or mineral amounts; ${s.others} non-label or blurred photos handled wrongly.`);
  if (s.unrun.length) console.log(`Expected but not run (${s.unrun.length}): ${s.unrun.join(', ')}. Pass every photo in the folder.`);
  console.log(`Verdict: ${s.verdict} (the brief's rule: calories and protein right on 9 of 10, no wrong or invented vitamin or mineral amount${s.incomplete ? '; INCOMPLETE means no real label was checked or an expected photo was not run' : ''}).`);
  process.exit(s.pass ? 0 : 1);
}
