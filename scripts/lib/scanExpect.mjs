// The comparison behind `scripts/scan-eval.mjs --expect=<file>` (brief label-photo-scan, Done when 5; brief food-vitamins-minerals, Done when 7): a photo's scan result against what its label prints,
// so an accuracy run says pass or fail per photo instead of leaving every line to be compared by eye. Pure, with a unit test. The expected values come from a person (or a reader) looking at the
// photo, never from a database: a database can describe an older label than the photo (the first run of this found one).
//
// A spec per photo: { kind: 'label' | 'notLabel' | 'blurred', kcal, p, c?, f?, micro?, percentOnly?, allowPer100g?, alt?, note? }
//   micro        the amounts the label prints per serving, { key: number | number[] } (an array: any of these is right, for example folate as DFE or as folic acid)
//   percentOnly  nutrients the label prints only as a % Daily Value: the scan must leave them out (a percent read as an amount is the case to find)
//   allowPer100g the label has no per-serving column to read, so "only per 100 g" is a correct answer
//   alt          other { kcal, p } pairs the label prints that count as right (a column with milk added)

const within = (got, want, abs, rel) => Math.abs(got - want) <= Math.max(abs, Math.abs(want) * rel);
export const kcalOk = (got, want) => within(got, want, 5, 0.03);
export const proteinOk = (got, want) => within(got, want, 0.6, 0.1);
const amountOk = (got, want) => within(got, want, 0.05, 0.1);

/** One photo: `{ pass, calProteinOk, problems, notes }`. `problems` fail the photo; `notes` are for reading (a nutrient the scan left out is safe, a carb or fat a little off is not the test). */
export function compareLabel(result, spec) {
  const problems = []; const notes = [];
  if (spec.kind === 'notLabel') {
    if (result.kind !== 'unreadable') problems.push(`not a nutrition label but the scan answered "${result.kind}"`);
    return { pass: problems.length === 0, calProteinOk: null, problems, notes };
  }
  const soft = spec.kind === 'blurred'; // a blurred photo may be refused, or read correctly: wrong numbers are the only failure
  if (result.kind === 'unreadable') {
    if (!soft) problems.push('unreadable (the label is readable)');
    return { pass: soft, calProteinOk: soft ? null : false, problems, notes };
  }
  if (result.kind === 'per100g') {
    if (!spec.allowPer100g && !soft) problems.push('answered "only per 100 g" but the label has a per-serving column');
    return { pass: Boolean(spec.allowPer100g || soft), calProteinOk: spec.allowPer100g || soft ? null : false, problems, notes };
  }
  const label = result.label;
  const sets = [{ kcal: spec.kcal, p: spec.p }, ...(spec.alt ?? [])];
  const match = sets.find(s => kcalOk(label.kcal, s.kcal) && proteinOk(label.p, s.p));
  if (!match) problems.push(`calories ${label.kcal} and protein ${label.p} g, label says ${sets.map(s => `${s.kcal} and ${s.p} g`).join(' or ')}`);
  for (const [k, want, got] of [['carbs', spec.c, label.c], ['fat', spec.f, label.f]]) {
    if (want !== undefined && got !== undefined && !within(got, want, 1, 0.1)) notes.push(`${k} ${got} g, label says ${want} g`);
  }
  const micro = label.micro ?? {};
  const printed = spec.micro ?? {};
  for (const [key, got] of Object.entries(micro)) {
    if (Object.hasOwn(printed, key)) {
      const wants = [].concat(printed[key]);
      if (!wants.some(w => amountOk(got, w))) problems.push(`${key} ${got}, label says ${wants.join(' or ')}`);
    } else if ((spec.percentOnly ?? []).includes(key)) problems.push(`${key} ${got} is a percent of Daily Value read as an amount`);
    else problems.push(`${key} ${got} but the label prints no amount for it (invented)`);
  }
  const left = Object.keys(printed).filter(k => !Object.hasOwn(micro, k));
  if (left.length) notes.push(`left out (safe): ${left.join(', ')}`);
  return { pass: problems.length === 0, calProteinOk: Boolean(match), problems, notes };
}

/** All photos: how many real labels had calories and protein right, how many wrong or invented amounts there were, and the verdict (at most one miss per 10 real labels, rounded down; no wrong amount; every non-label refused). */
export function summarize(rows) {
  const real = rows.filter(r => r.spec.kind === 'label');
  const calOk = real.filter(r => r.calProteinOk).length;
  const microProblems = rows.reduce((n, r) => n + r.problems.filter(p => !/^(calories|unreadable|answered|not a nutrition)/.test(p)).length, 0);
  const others = rows.filter(r => r.spec.kind !== 'label' && !r.pass).length;
  const allowedMisses = Math.floor(real.length / 10);
  const pass = real.length - calOk <= allowedMisses && microProblems === 0 && others === 0;
  return { real: real.length, calOk, microProblems, others, allowedMisses, pass };
}
