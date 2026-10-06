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
  key?: 'A' | 'B';
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
