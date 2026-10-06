/* Shapes of the data the app stores and exchanges. Everything in `normEntry` / `normBody` / `normProgram` / `normLibrary`
   (lib/validate) returns one of these; anything outside them is cleaned away. Dates are 'YYYY-MM-DD' strings; `updatedAt` is an ISO date-time. */

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

export type EquipmentKey = 'barbell' | 'shortbar' | 'ezbar' | 'dumbbell' | 'kettlebell' | 'cable' | 'machine' | 'bodyweight'
  | 'band' | 'trx' | 'plate' | 'medball' | 'other';

/** An exercise in the catalog: built-ins, layered with what the user set in `cfg.ex`. */
export interface ExerciseInfo {
  n: string;
  url?: string;
  eq?: EquipmentKey;
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
  muscleMap: Record<string, unknown>;
  mode: 1 | 2 | 3;
  m3Start: number;
  m3First: ProgKey;
  m2Even: ProgKey;
  pct: Partial<Record<PhaseKey, number>>;
  rxOverride: Partial<Record<PhaseKey, string>>;
  rm: Record<string, unknown>;
  phDef: Record<string, PhaseKey | null>;
  exPh: Record<string, PhaseKey | null>;
  progNames?: Partial<Record<ProgKey, string>>;
  bwGoal?: BodyGoal;
  liftGoals?: Record<string, Record<string, LiftGoal>>;
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
  restOn?: string;
  extra?: ExtraCard[];
}

/** Logged sessions by exercise id, oldest first. */
export type Logs = Record<string, LogEntry[]>;

/** Body-weight goal: the target, where you were when you set it, and an optional ISO date. */
export interface BodyGoal { w: number; start?: { w: number; d?: string }; by?: string }
/** A lift goal for one exercise and key ('any' or a phase). */
export interface LiftGoal { w: number; start?: number; by?: string }

/* ---------- Supplements, water and stretches ---------- */
export type SupplementSlot = 'morning' | 'noon' | 'night' | '';
export interface SupplementItem { id: string; n: string; slot: SupplementSlot; dose?: string; note?: string }
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

export type StretchTier = 'primary' | 'secondary' | '';
export interface Stretch { id: string; n: string; group: string; tier: StretchTier; url?: string; note?: string }
export interface StretchExperiment { id: string; n: string; url?: string; note?: string }
export interface StretchExtra extends StretchExperiment { day: number }
/** One week of stretch check-offs; keys of `done` are "<day 0-6>:<id>". */
export interface StretchWeek { done: Record<string, true>; skipped: Record<string, true>; extra: StretchExtra[] }
