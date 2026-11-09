/* ---------- Optional profile: birth year and sex (brief recommendations-by-age-sex) ----------
   Kept in `cfg.profile`, only to pick a published recommended amount in the Totals sheet. Both fields are optional, a year not a date, and nothing else reads them.
   Framework-free, so the client and the API share it (ADR 015). */

export type ProfileSex = 'female' | 'male';
export interface Profile {
  birthYear?: number;
  sex?: ProfileSex;
}

export const PROFILE_FIRST_YEAR = 1900;
/** The youngest age whose amounts the app shows: it is for adults (18 and over is the stated policy; the published adult groups start at 19). */
export const PROFILE_MIN_AGE = 19;
/** The oldest age taken as real; an older birth year is treated as a typing error. */
export const PROFILE_MAX_AGE = 120;

const thisYear = () => new Date().getFullYear();

/** Anything in, a clean profile or `undefined` (nothing usable left). A year outside 1900 to this year, or a sex other than the two published groups, is dropped. */
export function cleanProfile(p: unknown, year: number = thisYear()): Profile | undefined {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return undefined;
  const { birthYear, sex } = p as Record<string, unknown>;
  const out: Profile = {};
  if (typeof birthYear === 'number' && Number.isInteger(birthYear) && birthYear >= PROFILE_FIRST_YEAR && birthYear <= year) out.birthYear = birthYear;
  if (sex === 'female' || sex === 'male') out.sex = sex;
  return Object.keys(out).length ? out : undefined;
}

/** Age in whole years by the year difference from a local date (`YYYY-MM-DD`), so it is up to a year high before the birthday; `undefined` when there is no year or the age is not 19 to 120. */
export function profileAge(p: Profile | undefined, today: string): number | undefined {
  if (!p || p.birthYear === undefined) return undefined;
  const age = Number(today.slice(0, 4)) - p.birthYear;
  return Number.isInteger(age) && age >= PROFILE_MIN_AGE && age <= PROFILE_MAX_AGE ? age : undefined;
}
