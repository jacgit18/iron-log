#!/usr/bin/env node
// Accuracy run for the label photo scan (brief label-photo-scan, Done when 5). Not part of CI: it calls the real Claude API with your key and costs a
// fraction of a cent per photo. It runs the same prompt and validator the route uses (server/scan.ts), so what you see is what the app would fill.
//
//   ANTHROPIC_API_KEY=... npx tsx scripts/scan-eval.mjs [--model=claude-sonnet-5-5] photo1.jpg photo2.jpg ...
//   ANTHROPIC_API_KEY=... npx tsx scripts/scan-eval.mjs --supplement [--model=<id>] bottle1.jpg ...   (brief supplement-label-scan: the same prompt and validator as POST /api/scan/supplement;
//   photograph at least 8 of your own bottles, with IU, a blend, a gummy, a powder and a liquid among them, and compare every tracked amount with the bottle; the model and the result go in the PR)
//
// Each line now also shows the "micro" vitamin and mineral amounts (brief food-vitamins-minerals, Done when 7): compare them with the label too, per serving, and note how many labels
// had a wrong or invented amount (a wrong unit, a percent of Daily Value read as mg, a nutrient the label does not list); the kill criterion is in the brief.
// Compare each printed line with the label; the brief wants the calories and protein right on at least 9 of 10 real labels. Photos stay on your machine
// except for the call to Anthropic; nothing is written.
import { readFile } from 'node:fs/promises';
import { DEFAULT_MODEL, DEFAULT_SUPPLEMENT_MODEL, readLabel, readSupplement } from '../server/scan.ts';

const args = process.argv.slice(2);
const supplement = args.includes('--supplement');
const model = args.find(a => a.startsWith('--model='))?.slice(8) || (supplement ? process.env.SCAN_SUPPLEMENT_MODEL || DEFAULT_SUPPLEMENT_MODEL : process.env.SCAN_MODEL || DEFAULT_MODEL);
const files = args.filter(a => !a.startsWith('--'));
const key = process.env.ANTHROPIC_API_KEY;
if (!key || files.length === 0) {
  console.error('Usage: ANTHROPIC_API_KEY=... npx tsx scripts/scan-eval.mjs [--supplement] [--model=<id>] <photo.jpg>...');
  process.exit(2);
}
console.log(`model: ${model}`);
for (const file of files) {
  const bytes = await readFile(file);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) { console.log(`${file}: not a JPEG, skipped (the app sends JPEG)`); continue; }
  try {
    const result = await (supplement ? readSupplement : readLabel)(fetch, key, model, bytes.toString('base64'));
    console.log(`${file}: ${JSON.stringify(result)}`);
  } catch (err) {
    console.log(`${file}: failed (${err instanceof Error ? err.message : 'unknown'})`);
  }
}
