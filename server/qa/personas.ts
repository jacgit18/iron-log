/* ---------- QA test accounts (brief: qa-persona-picker) ----------
   One list read by three things: the seed script (scripts/qa-seed.mjs), the admin switch route and its screen, and the accounts document.
   Change a persona here and all three follow. Emails end in .invalid, which can never be a real address (RFC 2606). */

export type PersonaPlan = 'free' | 'paid' | 'lifetime' | 'founder' | 'beta';
export type PersonaGroup = 'Plans' | 'Limits' | 'Data volume' | 'Features';

export interface Persona {
  /** Stable slug: the key in the route, the auth id suffix and the email prefix. */
  id: string;
  name: string;
  group: PersonaGroup;
  plan: PersonaPlan;
  /** users.plan_status; null for plans that have none. */
  planStatus: 'active' | 'past_due' | null;
  /** Days from today that the plan renews; null for none. */
  renewsInDays: number | null;
  /** What the account looks like, one sentence. */
  scenario: string;
  /** What it is for. */
  tryThis: string;
  /** How much to put in it. */
  data: PersonaData;
}

export interface PersonaData {
  programs: boolean;
  /** Log entries spread over this many days back from today (0 = none). */
  logDays: number;
  /** Target number of log entries. */
  logEntries: number;
  /** Weekly body-weight entries over this many weeks back (0 = none). */
  bodyWeeks: number;
  /** Grocery items to create (0 = none). */
  groceryItems: number;
  /** Erase-my-data happened: data epoch 2, nothing left. */
  erased?: boolean;
}

const NONE: PersonaData = { programs: false, logDays: 0, logEntries: 0, bodyWeeks: 0, groceryItems: 0 };

export const PERSONAS: readonly Persona[] = [
  { id: 'new-user', name: 'New user', group: 'Plans', plan: 'free', planStatus: null, renewsInDays: null, scenario: 'Just signed up. No program, empty libraries.', tryThis: 'First-run screens and every empty state.', data: NONE },
  { id: 'paid-monthly', name: 'Paid, monthly', group: 'Plans', plan: 'paid', planStatus: 'active', renewsInDays: 12, scenario: 'Active subscription, renews in 12 days.', tryThis: 'Paid-only features and the billing screen.', data: { programs: true, logDays: 60, logEntries: 150, bodyWeeks: 9, groceryItems: 0 } },
  { id: 'lifetime', name: 'Lifetime', group: 'Plans', plan: 'lifetime', planStatus: null, renewsInDays: null, scenario: 'One-time purchase, no renewal date.', tryThis: 'Billing screen with no renewal.', data: { programs: true, logDays: 30, logEntries: 60, bodyWeeks: 4, groceryItems: 0 } },
  { id: 'founder', name: 'Founder', group: 'Plans', plan: 'founder', planStatus: null, renewsInDays: null, scenario: 'Early supporter with every paid feature.', tryThis: 'Founder label and feature access.', data: { programs: true, logDays: 30, logEntries: 60, bodyWeeks: 4, groceryItems: 0 } },
  { id: 'legacy-beta', name: 'Legacy beta', group: 'Plans', plan: 'beta', planStatus: null, renewsInDays: null, scenario: 'Old beta plan from before billing went live.', tryThis: 'The plan label and what beta can still reach.', data: { programs: true, logDays: 30, logEntries: 60, bodyWeeks: 4, groceryItems: 0 } },
  { id: 'paid-past-due', name: 'Paid, past due', group: 'Limits', plan: 'paid', planStatus: 'past_due', renewsInDays: -2, scenario: 'Payment failed two days ago; the plan is still paid.', tryThis: 'The warning and the downgrade path.', data: { programs: true, logDays: 60, logEntries: 150, bodyWeeks: 9, groceryItems: 0 } },
  { id: 'grocery-at-cap', name: 'Grocery at the cap', group: 'Limits', plan: 'free', planStatus: null, renewsInDays: null, scenario: 'The grocery catalogue holds 500 items, the most allowed.', tryThis: 'The over-the-cap message and what a 501st item does.', data: { programs: true, logDays: 14, logEntries: 30, bodyWeeks: 2, groceryItems: 500 } },
  { id: 'erased-account', name: 'Erased account', group: 'Limits', plan: 'free', planStatus: null, renewsInDays: null, scenario: 'Used Erase my data; the data epoch was bumped and nothing is left.', tryThis: 'A second device resetting after an erase.', data: { ...NONE, erased: true } },
  { id: 'heavy-logger', name: 'Heavy logger', group: 'Data volume', plan: 'free', planStatus: null, renewsInDays: null, scenario: 'About six months of daily logs, weekly body weight, two programs.', tryThis: 'Progress charts and history speed.', data: { programs: true, logDays: 183, logEntries: 1000, bodyWeeks: 26, groceryItems: 0 } },
  { id: 'three-year-veteran', name: 'Three-year veteran', group: 'Data volume', plan: 'paid', planStatus: 'active', renewsInDays: 200, scenario: 'About 5,000 entries over three years.', tryThis: 'Slow screens, large exports and sync size.', data: { programs: true, logDays: 1095, logEntries: 5000, bodyWeeks: 156, groceryItems: 0 } },
  { id: 'superset-builder', name: 'Superset builder', group: 'Features', plan: 'free', planStatus: null, renewsInDays: null, scenario: 'Both programs are full of supersets across the week.', tryThis: 'Moving one exercise of a superset to another day.', data: { programs: true, logDays: 28, logEntries: 80, bodyWeeks: 4, groceryItems: 0 } },
  { id: 'grocery-shopper', name: 'Grocery shopper', group: 'Features', plan: 'paid', planStatus: 'active', renewsInDays: 20, scenario: 'A working grocery list: 60 items across 4 stores, some priced.', tryThis: 'To get and At home lists, prices and unpriced items.', data: { programs: true, logDays: 30, logEntries: 60, bodyWeeks: 4, groceryItems: 60 } },
];

export const personaById = (id: string): Persona | undefined => PERSONAS.find(p => p.id === id);
/** The auth.user id the seed script gives a persona. Fixed, so a re-run finds the same account. */
export const personaAuthId = (id: string) => `qa-persona-${id}`;
export const personaEmail = (id: string) => `${id}@qa.invalid`;
