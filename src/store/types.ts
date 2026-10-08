/* The app store's state and actions, in one place: the core store (useAppStore) and its three slices
   (editor, settings, wellness) read and write each other through get(), so they share one AppState.
   Sheet forms (the `d` a save action receives) are typed loosely as `Form`; the sheets in components/ own their shape. */
import type { StoreApi } from 'zustand';
import type { SyncStatus } from '../sync/apiDb.js';
import type {
  BodyEntry, Cfg, DataFile, EquipmentKey, Experiment, FlatSlot, LibraryItem, LogEntry, Logs, MuscleKey, MuscleTags, PhaseKey, ProgKey, Program,
  SlotType, Snapshot, Stretch, StretchExperiment, StretchWeek, SupplementSlot, Supplements, Week,
} from '../types.ts';
import type { ExcelImport } from '../lib/excelImport.ts';

export type Flag = (text: string) => void;

/* ---------- Sheet forms: what each sheet hands its save action ---------- */
/** The exercise-typing field's result: an existing exercise id, or '__new' with the typed name in `nn`. */
export interface ExerciseChoice { ex: string; nn: string }
/** Video link and equipment typed for a new exercise (or a link for an existing one). */
export interface ExerciseExtras { nu?: string; ne?: EquipmentKey | '' }
export type PhaseChoice = PhaseKey | '' | null;
/** The Experiment sheet and the board's add-to-day sheet (which has no id). */
export interface ExperimentForm extends ExerciseChoice, ExerciseExtras { id?: string; ph: PhaseChoice; note?: string }
/** The exercise details sheet. Fields left out stay as they were. `tags: null` means back to the default tags. */
export interface ExerciseDetailsForm { name?: string; url?: string; eq?: EquipmentKey | ''; ph?: PhaseChoice; rm?: string | number | null; tags?: MuscleTags | null }
export interface SlotFormItem extends ExerciseChoice, ExerciseExtras { ph: PhaseChoice; w: number | null; bw?: boolean; rx?: string; note?: string }
/** The card (slot) editor. `target` aims it at a program and day when it was opened from the board. */
export interface SlotForm {
  id: string | null; sec: string; tier: string; type: SlotType; note: string; day: number; idx: number | null;
  target?: { key: string; day: number } | null; items: SlotFormItem[];
}
export interface StretchForm { id?: string; n: string; url?: string; note?: string; group?: string; tier?: string }
export interface StretchExpForm { id?: string; n: string; url?: string; note?: string }
export interface SupplementForm { id?: string; n: string; slot?: string; dose?: string; note?: string }
/** The log sheet's save: the entry plus the optional changes it can make along the way. */
export interface LogForm {
  entry: LogEntry; ph: PhaseKey | null; makeDefault: boolean; makeExDefault: boolean;
  rm: number | null | undefined; done: boolean; eq?: EquipmentKey | ''; url?: string;
}
/** Anything a sheet or host gives us that has no shape of its own yet. */
type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/* ---------- Notes: what the board tells you after you change it ---------- */
/** A day order and rest days (kind 'order'), or one card's day (kind 'card'). */
export interface DayOrder { order: number[]; rest: number[] }
export interface CardMove { slot: string; moved: number | null }
export type OrderState = DayOrder | CardMove;
interface OrderNoteBase { week: string; doneCol: number; lines: string[]; applied: boolean }
export type OrderNote = OrderNoteBase & ({ kind: 'order'; prev: DayOrder; next: DayOrder } | { kind: 'card'; prev: CardMove; next: CardMove });
export interface MoveNote {
  slot?: string;
  batch?: Record<string, number | null>;
  from?: number;
  fromShown: number;
  to: number;
  week: string;
  lines: string[];
  alt?: number | null;
}
export interface UncheckNote {
  week: string;
  text: string;
  entries: Logs; // what the uncheck removed, so Undo can put it back
  done: Record<string, boolean>; // key -> was it done before
}
export interface BackupMsg { kind: 'info' | 'ok' | 'err'; text: string; url?: string }

/** An open sheet: its `type` plus whatever that sheet needs. */
export interface Modal { type: string; [key: string]: Loose }

export interface ImportDraft {
  data: DataFile | ExcelImport;
  name: string;
  kind: 'json' | 'excel';
  useSettings?: boolean;
  sel?: Record<string, boolean>;
}

export interface Ready {
  cfg: boolean; logs: boolean; week: boolean; programs: boolean; lib: boolean; body: boolean; exp: boolean; str: boolean; strWeek: boolean; supp: boolean;
}

export type ExportKind = 'csv' | 'xlsx-all' | 'xlsx-week' | 'data';
/** The host's downloads handle (or the plain blob-link one). */
export interface Downloads { save(file: { filename: string; data: Loose }): Promise<unknown> }

/* ---------- Slices ---------- */
export interface EditorSlice {
  edProg: string | null; // 'A' | 'B' (in the rotation) or 'L:<id>' (a library program); null = the one on the board
  edDay: number;
  edKey(): string;
  edItem(): LibraryItem | null;
  edProgram(): Program;
  edName(): string;
  openAddToProgram(col: number): void;
  setEdProg(edProg: string | null): void;
  setEdDay(edDay: number): void;
  saveEdited(prog: Program): void;
  editProgram(fn: (prog: Program) => void): boolean;
  setLibrary(library: LibraryItem[]): void;
  moveEdSlot(i: number, dir: number): void;
  removeEdSlot(i: number): void;
  setDaySub(v: string): boolean;
  renameProgram(k: ProgKey, raw: string): false | void;
  renameLibItem(raw: string): false | void;
  libSnapshot(name: string, prog: Program, from: string, auto: boolean): LibraryItem;
  saveCurrentAs(name: string): void;
  loadVersion(target: string, slot: ProgKey): void;
  deleteLibItem(id: string): void;
  createProgram(name: string, from: ProgKey): boolean;
  saveSlot(d: SlotForm): string | null;
}

export interface SettingsSlice {
  importDraft: ImportDraft | null;
  importBusy: boolean;
  importError: string;
  importCount: number;
  setImportUseSettings(v: boolean): void;
  setImportSection(k: string, v: boolean): void;
  setPct(p: PhaseKey, raw: string | number): false | void;
  setRxOverride(p: PhaseKey, raw: string): void;
  setRest(raw: string | number): false | void;
  setRm(exId: string, raw: string | number): false | void;
  setCfgField<K extends keyof Cfg>(k: K, v: Cfg[K]): void;
  setBackupRepo(raw: string): void;
  readImportFile(file: File | null | undefined): Promise<void>;
  pasteImport(text: string): void;
  applyImport(mode: 'merge' | 'replace'): Promise<void>;
}

export interface WellnessSlice {
  stretches: Stretch[];
  stretchExps: StretchExperiment[];
  strWeek: StretchWeek;
  supp: Supplements;
  boardView: string;
  dailyView: string;
  setBoardView(v: string): void;
  setDailyView(v: string): void;
  saveStretches(): void;
  saveStrWeek(): void;
  saveSupp(): void;
  mutateStretches(fn: (d: { items: Stretch[]; experiments: StretchExperiment[] }) => void): boolean;
  mutateStrWeek(fn: (w: StretchWeek) => void): boolean;
  mutateSupp(fn: (s: Supplements) => void): boolean;
  setStretchDoc(doc: unknown): void;
  setStretchDone(day: number, id: string, on: boolean): void;
  setStretchesDone(day: number, ids: string[], on: boolean): void;
  skipStretchDay(day: number, on: boolean): void;
  saveStretch(d: StretchForm): string | null;
  deleteStretch(id: string): void;
  moveStretch(id: string, dir: number): void;
  saveStretchExp(d: StretchExpForm): string | null;
  deleteStretchExp(id: string): void;
  addStretchToDay(expId: string, day: number): boolean;
  removeStretchExtra(id: string): void;
  addSupplement(slot: SupplementSlot, name: string, dose?: string): boolean;
  setSupplementSlot(id: string, slot: SupplementSlot): boolean;
  removeSupplement(id: string): boolean;
  saveSupplement(d: SupplementForm): string | null;
  deleteSupplement(id: string): void;
  moveSupplement(id: string, dir: number): void;
  setSupplementTaken(date: string, id: string, on: boolean): boolean;
  addWater(date: string, oz: string | number): boolean;
  removeWater(date: string, i: number): boolean;
  setWaterGoal(raw: string | number): boolean;
  setWaterBoost(date: string, patch: { hot?: boolean; mins?: string | number }): boolean;
  setWaterByWeight(): boolean;
}

/* ---------- The core store ---------- */
export interface CoreSlice {
  cfg: Cfg;
  weekStart: Date;
  week: Week;
  logs: Logs;
  unsaved: string[]; // doc paths whose last write was refused (storage full, permission): kept until a write succeeds
  refusals: number; // writes refused so far this session
  sync: SyncStatus | null; // how syncing through the API is going; null when it is off (see src/sync)
  tab: string;
  mDay: number | null; // day shown on phones; null = pick the first day with open work
  library: LibraryItem[];
  experiments: Experiment[];
  body: BodyEntry[];
  programs: Record<string, Program>;
  storeMode: 'loading' | 'local' | 'db';
  saveFlag: string;
  ready: Ready;
  uncheckNote: UncheckNote | null;
  moveNote: MoveNote | null;
  orderNote: OrderNote | null;
  orderSkip: string[]; // 'week:column' suggestions dismissed this session
  modal: Modal | null;
  weekHist: Record<string, Week> | null; // every saved week, loaded on demand for Progress and exports
  historyLoading: boolean;
  dl: Downloads | null | undefined; // undefined = not checked yet, null = unavailable
  mcp: Loose; // the host's connector handle for GitHub backup (Claude-hosted only)
  backupBusy: boolean;
  backupMsg: BackupMsg | null;
  snoozeBackup: boolean;
  ghDirect: boolean; // back up with the viewer's own GitHub token
  ghToken: string;
  exporting: ExportKind | null;
  progView: string;
  bodySel: MuscleKey | null;
  bodySec: boolean;

  setProgView(v: string): void;
  selectMuscle(m: MuscleKey | null): void;
  setBodySec(v: boolean): void;
  saveTags(exId: string, tags: MuscleTags): void;
  resetTags(exId: string): void;

  snapshot(): Snapshot;
  stretchWeeksAll(): Promise<Record<string, StretchWeek>>;
  stretchWeekKeys(): Promise<string[]>;
  fullSnapshot(): Promise<Snapshot>;
  loadHistory(): Promise<void>;
  allWeeks(): Promise<Record<string, Week>>;
  isReady(): boolean;
  weekKey(): string;
  activeProgKey(): ProgKey;
  activeProgram(): Program;
  activeSlots(): FlatSlot[];
  slotById(id: string): FlatSlot | undefined;
  logTargetExists(slotId: string, idx: number): boolean;
  blocked(): boolean;

  setTab(tab: string): void;
  setMDay(d: number | null): void;
  openModal(modal: Modal | null): void;
  closeModal(): void;

  saveCfg(): void;
  saveWeek(): void;
  saveBody(): void;
  saveLibrary(): void;
  saveExperiments(): void;
  saveLog(exId: string): void;
  saveProgram(k: string, prog: Program): void;
  saveDoc(path: string, data: unknown): void;
  removeDoc(path: string): void;
  mutateCfg(fn: (c: Cfg) => void): boolean;
  mutateWeek(fn: (w: Week) => void): boolean;
  mutateChecks(fn: (w: Week) => void, opts?: { removeLogged?: boolean; label?: string }): boolean;

  suggestOrder(slots: FlatSlot[], before: Week): void;
  canUndoOrder(): boolean;
  applyOrder(): boolean;
  undoOrder(): boolean;
  dismissOrder(): void;
  undoUncheck(): void;
  dismissUncheck(): void;
  checkCard(slotId: string, on: boolean): void;
  checkItem(slotId: string, idx: number, on: boolean): void;
  checkDay(day: number, on: boolean): void;
  skipCard(slotId: string): void;
  skipCards(ids: string[]): void;
  moveCards(ids: string[], day: number): void;

  setExperiments(experiments: Experiment[]): void;
  saveExperiment(d: ExperimentForm): string | null;
  applyExerciseUrl(ex: string, raw: string | null | undefined): void;
  createExercise(d: { nn: string } & ExerciseExtras): string;
  addExerciseToDay(col: number, d: ExperimentForm): string | null;
  saveExerciseDetails(exId: string, d: ExerciseDetailsForm): string | null;
  createLibraryExercise(d: ExerciseDetailsForm): string | null;
  deleteExercise(exId: string): string | null;
  deleteExperiment(id: string): void;
  addToDay(entryId: string, col: number): boolean;
  removeExtra(slotId: string): void;
  setWarm(day: number, wid: string, on: boolean): void;
  addWarmup(n: string, rx: string): boolean;
  removeWarmup(id: string): void;
  restOverflow(n: number): FlatSlot[];
  setRestDay(n: number, opts?: { skipOverflow?: boolean }): boolean | undefined;
  swapDays(d: number, dir: number): boolean;
  setPhase(slotId: string, idx: number, ph: PhaseKey): void;
  setWeekProg(k: ProgKey): void;
  setMode(mode: Cfg['mode']): void;
  moveSlot(slotId: string, day: number): void;
  undoMove(): void;
  dismissMove(): void;
  gotoWeek(which: 'today' | 'prev' | 'next'): void;

  addEntry(slotId: string, idx: number, entry: LogEntry, opts?: { check?: boolean }): boolean;
  quickLog(slotId: string, idx: number): void;
  submitLog(slotId: string, idx: number, form: LogForm): boolean;
  setLiftGoal(exId: string, key: string, raw: string | number, by?: string, from?: string): boolean;
  clearLiftGoal(exId: string, key: string): void;
  updateLog(exId: string, target: LogEntry, entry: LogEntry): boolean;
  deleteLog(exId: string, target: LogEntry): boolean;
  retryUnsaved(): void;
  eraseData(parts: { logs?: boolean; weeks?: boolean; body?: boolean; programs?: boolean; settings?: boolean }): Promise<boolean>;

  saveBodyWeight(v: string | number): boolean;
  setBodyGoal(raw: string | number, by?: string): boolean;
  clearBodyGoal(): void;
  deleteBodyWeight(wk: string): void;

  runExport(kind: ExportKind, fn: (dl: Downloads) => Promise<unknown>): Promise<void>;
  exportCsv(): Promise<void>;
  downloadExcel(which: 'all' | 'week'): Promise<void>;
  downloadData(): Promise<void>;
  snooze(): void;
  backupToGitHub(): Promise<void>;
  canBackup(): boolean;
  backupNow(): Promise<void> | undefined;
  lastBackup(): Loose;
  setGhToken(raw: string): boolean;
  forgetGhToken(): void;
  setGhRepo(raw: string): boolean;
  backupDirect(): Promise<void>;
  restoreFromGitHub(): Promise<void>;
  init(): Promise<void>;
}

export type AppState = CoreSlice & EditorSlice & SettingsSlice & WellnessSlice;
export type StoreSet = StoreApi<AppState>['setState'];
export type StoreGet = StoreApi<AppState>['getState'];
