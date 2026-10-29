/* Shapes of the data the app stores and exchanges. Everything in `normEntry` / `normBody` / `normProgram` / `normLibrary`
   (shared/validate) returns one of these; anything outside them is cleaned away. Dates are 'YYYY-MM-DD' strings; `updatedAt` is an ISO date-time. */

import type { IssueStatus } from './shared/issues.ts';
export type PhaseKey = 'strength' | 'iso' | 'hyp' | 'exp' | 'mob';
export type SlotType = 'single' | 'superset' | 'either';

/** One set inside a logged session. A field is null when it was left blank or was out of range. */
export interface LogSet {
  w?: number | null;
  r?: number | null;
  sec?: number | null;
}

/** One logged session of an exercise (`id` is optional: older entries have none). */
export interface LogEntry {
  d: string;
  ph?: PhaseKey | null;
  w?: number | null;
  s?: number | null;
  r?: number | null;
  sec?: number | null;
  sets?: LogSet[];
  n?: string;
  slot?: string;
  wk?: string;
  id?: string;
  auto?: true;
  updatedAt?: string;
}

/** One body-weight entry, one per week (`wk` is the week's Monday). */
export interface BodyEntry {
  wk: string;
  d: string;
  w: number;
  updatedAt?: string;
}

export interface ProgramItem {
  ex: string;
  ph: PhaseKey | null;
  w: number | null;
  bw?: true;
  rx?: string;
  note?: string;
}

export interface ProgramSlot {
  id: string;
  sec?: string;
  tier?: string;
  type?: SlotType;
  note?: string;
  /** The week (its Sunday, YYYY-MM-DD) this card starts in. Weeks before it leave the card out, so adding a card never
   *  reopens a finished day or an earlier week. Absent: every week (built-in cards, and cards from before this field). */
  from?: string;
  items: ProgramItem[];
}

export interface ProgramDay {
  title: string;
  sub?: string;
  makeup?: true;
  slots: ProgramSlot[];
}

export interface Program {
  days: ProgramDay[];
  key?: 'A' | 'B' | 'N'; // 'N': a saved version, which belongs to neither rotation program
  warm?: string;
  sledAdded?: true;
  sledTop?: true;
}

/** A saved version of a program. */
export interface LibraryItem {
  id: string;
  name: string;
  from?: 'A' | 'B';
  at: string;
  auto?: true;
  created?: true;
  prog: Program;
}

export type EquipmentKey = 'band' | 'barbell' | 'bench' | 'bodyweight' | 'cable' | 'dumbbell' | 'ezbar' | 'kettlebell' | 'machine'
  | 'medball' | 'plate' | 'rope' | 'sandbag' | 'shortbar' | 'sled' | 'tire' | 'trapbar' | 'trx' | 'vest' | 'other';

/** Built-in equipment, or one the user added: `x:` and a short slug, named in `cfg.equipment`. */
export type EquipmentId = EquipmentKey | `x:${string}`;

/** An exercise in the catalog: built-ins, layered with what the user set in `cfg.ex`. */
export interface ExerciseInfo {
  n: string;
  url?: string;
  eq?: EquipmentId;
}

export interface WarmupItem {
  id: string;
  n: string;
  rx: string;
}

/** The slice of the settings document that the program/exercise helpers read. */
export interface ProgramCfg {
  ex?: Record<string, Partial<ExerciseInfo>>;
  warmup?: WarmupItem[];
}

/** An exercise on a card. Cards from a program carry a weight; Experiment cards carry only the exercise and phase. */
export type CardItem = Pick<ProgramItem, 'ex' | 'ph'> & Partial<Omit<ProgramItem, 'ex' | 'ph'>>;

/** A card on the board: a program slot flattened out (or an Experiment card) with its day number (1-based) and a type that is never missing. */
export type FlatSlot = Omit<ProgramSlot, 'type' | 'items'> & { day: number; type: SlotType; items: CardItem[]; experiment?: true; added?: true };

/* Programs as they exist before ids are filled in: the built-in data and old saved copies have slots without an `id`.
   `withAllDays` (lib/data) gives every slot one, so what it returns is a full `Program`. */
export type SlotDraft = Omit<ProgramSlot, 'id'> & { id?: string };
export type DayDraft = Omit<ProgramDay, 'slots'> & { slots: SlotDraft[] };
export type ProgramDraft = Omit<Program, 'days'> & { days: DayDraft[] };

/* ---------- Settings, weeks and logs ---------- */
export type ProgKey = 'A' | 'B';

/** The settings document (cfg). Only the keys the training logic reads are listed. */
export interface Cfg extends ProgramCfg {
  ex: Record<string, Partial<ExerciseInfo>>; // what you set on an exercise, layered over the built-in entry
  muscleMap: Record<string, MuscleTags>;
  mode: 1 | 2 | 3;
  m3Start: number;
  m3First: ProgKey;
  m2Even: ProgKey;
  pct: Partial<Record<PhaseKey, number>>;
  rxOverride: Partial<Record<PhaseKey, string>>;
  rm: Record<string, number>;
  phDef: Record<string, PhaseKey | null>;
  exPh: Record<string, PhaseKey | null>;
  progNames?: Record<string, string>; // program key ('A', 'B') -> your name for it
  bwGoal?: BodyGoal;
  liftGoals?: Record<string, Record<string, LiftGoal>>;
  /** Equipment the user added: id (`x:` and a slug) to its name. */
  equipment?: Record<string, string>;
  /** Sessions a week you want to do an exercise, by exercise id (1 to 7). */
  freqGoals?: Record<string, number>;
  rest?: number; // rest timer, seconds
  /** Off (false) turns off the heads-up when a move puts the same muscles on back-to-back days and the day-order suggestions. On when unset. */
  injuryPrevention?: boolean;
}

/** An Experiment (or added) card on one week. */
export interface ExtraCard {
  id: string;
  day: number;
  ex: string;
  ph: PhaseKey | null;
  note?: string;
  add?: true;
}

/** One exercise taken out of a superset card for this week and put on another day (Board > a superset card's ⋯ > Move <exercise>). The
 *  card `from` shows without exercise `k`, as the new card `rest` (new ids, so the week's ticks, skips and phases are keyed afresh and the
 *  program's own keys stay as they were); the exercise is the plain card `id` on `day`, with the sets and weight it had. */
export interface SplitCard {
  id: string;
  from: string;
  rest: string;
  k: number;
  day: number;
  item: ProgramItem;
}

/** One week's state. Keys are card ids ("A-d1s1"), item keys ("A-d1s1#0" / "A-d1s1:0") and day numbers. */
export interface Week {
  prog: ProgKey | null;
  done: Record<string, true>;
  skipped: Record<string, true>;
  moved: Record<string, number>;
  ph: Record<string, PhaseKey>;
  warm: Record<string, Record<string, boolean>>;
  rest?: number[];
  order?: number[];
  /** Each rest day's own date (YYYY-MM-DD), keyed by its column. Older files stored one string, read as the first rest day's date. */
  restOn?: Record<string, string>;
  /** For a rest ticked on an empty day (it took that day's place): rest column to the program day it displaced, so unticking puts that day back. */
  restTook?: Record<string, number>;
  /** The rest days, day order and rest date of the program this week is NOT showing, so ticking rest on one program leaves the other alone. */
  stash?: Partial<Record<ProgKey, WeekLayout>>;
  extra?: ExtraCard[];
  /** Superset exercises moved to another day for this week only; see SplitCard. */
  split?: SplitCard[];
  /** What the week ran (ADR 022): the program it used and that program's cards, written down each time the week is saved. A week
   *  before this one is shown and counted from this, so editing or loading a program, or changing the mode, never rewrites it. */
  ran?: WeekRan;
}

export interface WeekLayout { rest?: number[]; order?: number[]; restOn?: Record<string, string>; restTook?: Record<string, number> }

export interface WeekRan { prog: ProgKey; program: Program }

/** Logged sessions by exercise id, oldest first. */
export type Logs = Record<string, LogEntry[]>;

/** First vs latest working weight of one exercise and phase over a window (see lib/trends weightChanges). */
export interface WeightChange { id: string; ph: string | null; w0: number; w1: number; d0: string; d1: string; n: number; pct: number }
/** A session that beat an exercise's best top set: heavier, or more reps at the same weight. `prev` is the best it beat. */
export interface PersonalBest { id: string; d: string; w: number; r: number; prev: { w: number; r: number; d: string } }

/** Body-weight goal: the target, where you were when you set it, and an optional ISO date. */
export interface BodyGoal { w: number; start?: { w: number; d?: string }; by?: string }
/** A lift goal for one exercise and key ('any' or a phase). */
export interface LiftGoal { w: number; start?: number; by?: string }

/* ---------- Supplements, water and stretches ---------- */
export type SupplementSlot = 'morning' | 'noon' | 'night' | '';
/** `catalogId` and `brand`: added from the catalog (ADR 029): a Library supplement, name and brand kept from the catalog. Without them it is Custom. */
export interface SupplementItem { id: string; n: string; slot: SupplementSlot; dose?: string; note?: string; brand?: string; catalogId?: string }
/** What was ticked off on each day: {"YYYY-MM-DD": {<id>: true}}. */
export type Taken = Record<string, Record<string, true>>;
export interface Boost { hot?: true; mins?: number }
/** The supplements document, which also holds the water log. Water amounts are ounces. */
export interface Supplements {
  waterGoal: number;
  waterMode: 'weight' | 'fixed';
  water: Record<string, number[]>;
  boost: Record<string, Boost>;
  items: SupplementItem[];
  taken: Taken;
}

/* ---------- Grocery list (synced to the account, ADR 039) ---------- */
/** How a weighed item is sold. */
export type GroceryUnit = 'lb' | 'kg' | 'oz';
/** Someone you share groceries with. `covered`: their share is already paid some other way (money in the account that pays the card), so the settle-up does not ask them for it.
 *  `gone`: removed from the group but still named by past months (a split or a payer), so those months read as they did; hidden everywhere else and left out of anything new. */
export interface GroceryPerson { id: string; n: string; covered?: true; gone?: true }
/** A sharing group: the people you split with ("Home", "Costco run"), and the stores that default to it. You are always in it and are not listed. */
export interface GroceryGroup { id: string; n: string; people: GroceryPerson[]; stores: string[]; gone?: true } // `gone`: removed, but past months still name its people (all marked gone too); hidden everywhere else
/** Who shares one purchase with you: `with` are the people's ids (none = just you). `notMine`: it is for them, not you, so your share is nothing. */
export interface GroceryShare { with: string[]; notMine?: true }
/** A thing you buy. `store` is where ('' = anywhere), `qty` the usual count, `cents` the last unit price in cents. `every`: on each month's list
 *  ("Every month"); otherwise it is a "When out" item, on this month's list only while `out` is set (unchecked on the At home list).
 *  `note` is an optional short comment ("the green ones"), left out when empty. `unit` is set for things sold by weight (meat, produce):
 *  `qty` is then the weight and `cents` the price per unit; left out for the usual "each". */
export interface GroceryItem { id: string; n: string; store: string; qty: number; cents: number | null; every: boolean; out: boolean; note?: string; unit?: GroceryUnit; share?: GroceryShare }
/** The catalogue: store names in the order shown, and the items. A month's list is drawn from it. */
/** `retired`: stores that were removed while a past month still uses them (a purchase pinned to the store, its tax, who paid): hidden from every list and picker, but their name stays valid so those months read as they did; adding a store with the same name brings it back (ADR 063). */
export interface Grocery { stores: string[]; items: GroceryItem[]; groups?: GroceryGroup[]; retired?: string[] }
/** A store as the server keeps it: one row per store, the name is its id. */
export interface GroceryStore { id: string; n: string; retired?: true }
/** One item in one month: ticked off (`got`, bought), or `have`: you have it, so it is not on that month's list (ADR 054); and the count and unit price (cents) paid when they differ from the catalogue or were recorded at the tick.
 *  `prices`: the price of each one bought this month, in cents, when they cost different amounts (beef, 3 packs: 8.99, 10.49, 9.25). The count is then how many there are and the line total is their sum; `qty` and `cents` are not used. */
/** `store`: where the item was bought this month when that is not its usual store (Move to on To get); '' is Anywhere, absent is the item's own store. */
/** `unpriced`: bought with no price at all (the item had none and none was typed), so a price given to the item later does not reach back and price this month's purchase. */
export interface GroceryLine { got?: true; have?: true; qty?: number; cents?: number; prices?: number[]; unpriced?: true; share?: GroceryShare; packShares?: (GroceryShare | null)[]; store?: string }
/** The catalogue plus every saved month: what the data file and the backups hold of the grocery list. */
export interface GroceryData extends Grocery { months: Record<string, GroceryMonth> }
/** One month's list (`grocery/YYYY-MM`): its lines by item id, and `pulled`: items put on that month's list by older versions (read, no longer written). */
/** `tax`: the sales tax in cents typed from the receipt for each store this month, on top of what the ticked lines cost; no entry means none. */
/** `paid`: which owed amounts have been settled outside the app, by `paidKey(store, payer, person)`: the cents that were settled (the row counts as paid only while it is not above that, so a later purchase that raises it shows as owed again), or `false` for a person marked Share already paid whose amount you say is not paid. An entry is kept only when it differs from the default, so no entry means the default. */
export interface GroceryMonth { lines: Record<string, GroceryLine>; pulled: string[]; payer?: Record<string, string>; tax?: Record<string, number>; paid?: Record<string, number | false>; carried?: string }

export type StretchTier = 'primary' | 'secondary' | '';
/** `catalogId`: added from the catalog (ADR 026, 027): a Library stretch, its name kept from the catalog. Without it the stretch is Custom. */
export interface Stretch { id: string; n: string; group: string; tier: StretchTier; url?: string; note?: string; catalogId?: string }
/** `group`: the group a catalog stretch belongs to (its main muscle), kept so promoting the experiment files it there. */
export interface StretchExperiment { id: string; n: string; url?: string; note?: string; group?: string }
export interface StretchExtra extends StretchExperiment { day: number }
/** One week of stretch check-offs; keys of `done` are "<day 0-6>:<id>". */
export interface StretchWeek { done: Record<string, true>; skipped: Record<string, true>; extra: StretchExtra[] }

/* ---------- Muscles ---------- */
export type MuscleKey = 'neck' | 'traps' | 'frontdelt' | 'sidedelt' | 'reardelt' | 'rotatorcuff' | 'chest' | 'serratus' | 'biceps' | 'triceps' | 'forearms'
  | 'upperabs' | 'lowerabs' | 'obliques' | 'deepcore' | 'lats' | 'upperback' | 'lowerback' | 'glutes' | 'abductors' | 'adductors' | 'hipflexors'
  | 'quads' | 'hamstrings' | 'calves' | 'shins';
/** What an exercise trains: primary (p) and secondary (s) muscles, or `mob` for mobility work that is not counted. */
export interface MuscleTags { p?: MuscleKey[]; s?: MuscleKey[]; mob?: true }

/* ---------- Catalog (ADR 025, 026, 028) ---------- */
export type CatalogKind = 'exercise' | 'stretch' | 'supplement' | 'recipe';
/** A catalog row's `data`: the fields the app shows, already mapped to the app's names by `catalog:import`. */
export interface CatalogData {
  /** null: the dataset gives none (shown blank, not Other). */
  eq?: EquipmentKey | null;
  muscles?: MuscleTags;
  level?: string;
  force?: string | null;
  mechanic?: string | null;
  /** The dataset's own category (free-exercise-db: strength, stretching, cardio, ...). */
  category?: string;
  instructions?: string[];
  /** Supplements (DSLD): the product's form, e.g. Capsule, Powder. */
  form?: string;
  /** Recipes (Wikibooks Cookbook): the recipe's category, ingredient lines (amount text included), steps and the time and servings it gives. */
  recipe?: { cat: RecipeCategory; ing: string[]; steps: string[]; servings?: number; minutes?: number };
}

/** A catalog row as GET /api/catalog lists it (no instructions), or as the search returns it (supplements carry a brand). */
export interface CatalogItem { id: string; name: string; brand?: string; data: CatalogData }

/* ---------- Recipes (synced to the account as the list 'recipe', ADR 084) ---------- */
export type RecipeCategory = 'protein' | 'sides' | 'sauces' | 'seasonings' | 'drinks' | 'breakfast' | 'dessert' | 'other';
/** One ingredient line: `n` is the name that is matched against the At home list, `amt` the free-text amount ("2 cups"); `home` is the id
 *  of the At home item the person linked it to by hand. `sub` is what they use instead of `n` (it is matched in `n`'s place); `skip` marks an
 *  ingredient they leave out (listed, but not counted and never added to To get). */
export interface RecipeIngredient { n: string; amt?: string; home?: string; sub?: string; skip?: true }
/** A recipe you wrote or copied from the catalog (`from` is its catalog id then). Custom when it has no `from`. `edited`: a copy you changed
 *  after copying it (only on a recipe with a `from`). */
export interface Recipe { id: string; n: string; cat: RecipeCategory; ing: RecipeIngredient[]; steps: string[]; servings?: number; minutes?: number; note?: string; from?: string; edited?: true }

/* ---------- Snapshots and the data file ---------- */
/** An exercise to try (an Experiment list entry). */
export interface Experiment { id: string; ex: string; ph: PhaseKey | null; note: string }

/** What the export and backup builders read: the app's state at one moment. */
export interface Snapshot {
  cfg: Cfg;
  logs: Logs;
  programs: Record<string, Program>;
  library: LibraryItem[];
  body: BodyEntry[];
  experiments?: Experiment[];
  stretches?: Stretch[];
  stretchExps?: StretchExperiment[];
  stretchWeeks?: Record<string, StretchWeek>;
  supp?: Supplements;
  grocery?: GroceryData;
  recipes?: Recipe[];
}

/** A data file after `normalizeData` has checked and cleaned it. `config` holds only the keys the file had. */
export interface DataFile {
  exportedAt?: string;
  config: Partial<Cfg>;
  programs: Record<string, Program>;
  library: LibraryItem[];
  logs: Logs;
  weeks: Record<string, Week>;
  body: BodyEntry[];
  experiments: Experiment[];
  stretches: { items: Stretch[]; experiments: StretchExperiment[] } | null;
  stretchWeeks: Record<string, StretchWeek>;
  supplements: Supplements | null;
  grocery: GroceryData | null;
  recipes?: Recipe[]; // left out when the file has none
}

/* ---------- Production issues (admin screen; the server's /api/issues, ADR 013 amendment) ---------- */
export type { IssueStatus };
export type IssueCounts = Record<IssueStatus, number>;
/** One fingerprint of a scrubbed error report. Times are ISO strings. */
export interface Issue {
  fingerprint: string;
  kind: 'error' | 'server' | 'sync' | 'unhandledrejection';
  message: string;
  topFrame: string;
  page: string;
  firstSeen: string;
  lastSeen: string;
  occurrences: number;
  firstVersion: string;
  lastVersion: string;
  status: IssueStatus;
  note: string;
}
