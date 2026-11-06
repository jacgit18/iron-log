import { validStep } from '../shared/validate.js';

// The "Weight step" an exercise goes up by (lb): what the field accepts and shows. The rule that uses it is `stepOf` in logic.ts.
export const STEP_CHIPS = [2.5, 5, 10] as const;
export const STEP_ERR = 'Enter a step above 0, up to 50, in 0.5 steps.';

export type StepInput = { ok: true; step: number | null } | { ok: false };

/** What was typed: empty means "not set" (the default applies), a good number is the step, anything else is refused. */
export function parseStep(text: string): StepInput {
  const t = text.trim().replace(',', '.');
  if (t === '') return { ok: true, step: null };
  const n = /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
  return validStep(n) ? { ok: true, step: n } : { ok: false };
}

/** The saved step as the field shows it ('' when none is saved or the stored value is not usable). */
export const stepText = (step: number | undefined): string => (validStep(step) ? String(step) : '');
