import { PROFILE_MIN_AGE, cleanProfile } from '../shared/profile.js';
import type { Profile } from '../shared/profile.js';

/* ---------- Editing the optional profile in Settings (brief recommendations-by-age-sex) ----------
   Pure, so the rules have unit tests; `ProfileRow` only draws them. */

/** What to say about a birth year as typed: an `error` while it cannot be saved (empty is fine, it clears the year), or a `note` when it is saved but the sheet will use the adult range. */
export function yearFeedback(text: string, year: number): { error: string; note: string } {
  const t = text.trim();
  if (t === '') return { error: '', note: '' };
  if (!/^\d{4}$/.test(t)) return { error: 'Enter a four-digit year, like 1985.', note: '' };
  const y = Number(t);
  if (y < 1900 || y > year) return { error: `Enter a year from 1900 to ${year}.`, note: '' };
  if (y > year - PROFILE_MIN_AGE) return { error: '', note: 'Amounts are shown for ages 19 and over, so the adult range is used.' };
  return { error: '', note: '' };
}

/** The profile after one edit: a typed year (an unusable one leaves the saved year as it was), or a sex choice (`'none'` is Prefer not to say). `undefined` when nothing is left. */
export function editProfile(current: Profile | undefined, patch: { year?: string; sex?: 'female' | 'male' | 'none' }, year: number): Profile | undefined {
  const next: Record<string, unknown> = { ...current };
  if (patch.year !== undefined) {
    if (patch.year.trim() === '') delete next.birthYear;
    else if (!yearFeedback(patch.year, year).error) next.birthYear = Number(patch.year.trim());
  }
  if (patch.sex !== undefined) { if (patch.sex === 'none') delete next.sex; else next.sex = patch.sex; }
  return cleanProfile(next, year);
}
