/* The app store's state and actions, in one place: the core store (useAppStore) and its three slices
   (editor, settings, wellness, grocery) read and write each other through get(), so they share one AppState.
   Sheet forms (the `d` a save action receives) are typed loosely as `Form`; the sheets in components/ own their shape. */
import type { StoreApi } from 'zustand';
import type { SyncStatus } from '../sync/apiDb.js';
import type {
  BodyEntry, CatalogItem, Cfg, DataFile, DietEntry, Grocery, GroceryData, GroceryMonth, GroceryShare, GroceryUnit, EquipmentId, Experiment, FlatSlot, LibraryItem, LogEntry, Logs, Recipe, MuscleKey, MuscleTags, PhaseKey, ProgKey, Program,
  ProgramSlot, SlotType, Snapshot, Stretch, StretchExperiment, StretchWeek, SupplementSlot, Supplements, Week,
} from '../types.ts';
import type { ExcelImport } from '../lib/excelImport.ts';
import type { WeekPatch } from '../lib/programMove.ts';
import type { BackupInfo } from '../lib/autoBackup.ts';
import type { ServerBackupList } from '../lib/serverBackups.ts';

export type Flag = (text: string) => void;

/* ---------- Sheet forms: what each sheet hands its save action ---------- */
/** The exercise-typing field's result: an existing exercise id, or '__new' with the typed name in `nn`. A catalog exercise picked in
 *  the field comes as `ex` = its catalog id with the item in `cat`; the save adds it to the library first when it is not there yet (ADR 036). */
export interface ExerciseChoice { ex: string; nn: string; cat?: CatalogItem }
/** Video link and equipment typed for a new exercise (or a link for an existing one). */
export interface ExerciseExtras { nu?: string; ne?: EquipmentId | '' }
export type PhaseChoice = PhaseKey | '' | null;
/** The Experiment sheet and the board's add-to-day sheet (which has no id). */
export interface ExperimentForm extends ExerciseChoice, ExerciseExtras { id?: string; ph: PhaseChoice; note?: string }
/** The exercise details sheet. Fields left out stay as they were. `tags: null` means back to the default tags. */
export interface ExerciseDetailsForm { name?: string; url?: string; eq?: EquipmentId | ''; ph?: PhaseChoice; rm?: string | number | null; tags?: MuscleTags | null }
export interface SlotFormItem extends ExerciseChoice, ExerciseExtras { ph: PhaseChoice; w: number | null; bw?: boolean; rx?: string; note?: string }
/** The card (slot) editor. `target` aims it at a program and day when it was opened from the board. */
export interface SlotForm {
  id: string | null; sec: string; tier: string; type: SlotType; note: string; day: number; idx: number | null;
  target?: { key: string; day: number } | null; items: SlotFormItem[];
  /** Adding only: put a copy of the new card on each of these days (each copy gets its own id). Overrides `day`. */
  days?: number[];
  /** Adding from an Experiment entry (To program): the entry leaves the list once the card is saved, and one Undo takes the card out again and puts the entry back. */
  fromExp?: string;
}
/** `cat`: a new stretch picked from the catalog in the sheet; it is saved with that catalog id and name (ADR 036). */
export interface StretchForm { id?: string; n: string; url?: string; note?: string; group?: string; tier?: string; cat?: CatalogItem | null }
export interface StretchExpForm { id?: string; n: string; url?: string; note?: string; group?: string }
export interface SupplementForm { id?: string; n: string; slot?: string; dose?: string; note?: string }
/** The log sheet's save: the entry plus the optional changes it can make along the way. */
export interface LogForm {
  entry: LogEntry; ph: PhaseKey | null; makeDefault: boolean; makeExDefault: boolean;
  rm: number | null | undefined; done: boolean; eq?: EquipmentId | ''; url?: string;
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
/** After a card is skipped: its Undo un-skips it and puts back the ticks the skip cleared. */
export interface SkipNote {
  week: string;
  slotId: string;
  key?: string; // the week.skipped key that was set; the card's id unless one superset exercise was skipped
  text: string;
  done: string[]; // the done keys the skip cleared
}

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
  cfg: boolean; logs: boolean; week: boolean; programs: boolean; lib: boolean; body: boolean; exp: boolean; str: boolean; strHist: boolean; strWeek: boolean; supp: boolean;
  groc: boolean; grocMonths: boolean; // the grocery list's catalogue and its months (ADR 039)
}

export type ExportKind = 'csv' | 'xlsx-all' | 'xlsx-week' | 'data';
/** The host's downloads handle (or the plain blob-link one). */
export interface Downloads { save(file: { filename: string; data: Loose }): Promise<unknown> }

/* ---------- Slices ---------- */
/** Body weight: one weigh-in per week, and the goal kept in the config. */
export interface BodySlice {
  saveBodyWeight(v: string | number): boolean;
  setBodyGoal(raw: string | number, by?: string): boolean;
  clearBodyGoal(): void;
  deleteBodyWeight(wk: string): void;
}

/** The experiment list and the exercise library: exercises, equipment and warm-ups, and putting them on a day. */
export interface LibrarySlice {
  setExperiments(experiments: Experiment[]): void;
  saveExperiment(d: ExperimentForm): string | null;
  /** The exercise id a sheet's choice stands for, adding it to the library first when it is new. */
  resolveExerciseChoice(d: ExerciseChoice & ExerciseExtras, chosen: string): string;
  applyExerciseUrl(ex: string, raw: string | null | undefined): void;
  applyExerciseEq(ex: string, eq: EquipmentId | '' | null | undefined): void;
  addEquipment(name: string): EquipmentId | null;
  removeEquipment(id: string): boolean;
  createExercise(d: { nn: string } & ExerciseExtras): string;
  addExerciseToDay(col: number, d: ExperimentForm): string | null;
  saveExerciseDetails(exId: string, d: ExerciseDetailsForm): string | null;
  createLibraryExercise(d: ExerciseDetailsForm): string | null;
  /** Adds a catalog exercise to the library as a snapshot under its catalog id (ADR 026). Returns an error message, or null. */
  addCatalogExercise(item: CatalogItem): string | null;
  deleteExercise(exId: string): string | null;
  deleteExperiment(id: string): void;
  addToDay(entryId: string, col: number): boolean;
  removeExtra(slotId: string): void;
  addWarmup(n: string, rx: string): boolean;
  /** `d` is the Stretches day it was removed from, where its Undo shows. */
  removeWarmup(id: string, d?: number): void;
}

/** Rest days, day swaps, phases and the week's program, and moving a card to another day. */
export interface ProgramSlice {
  restOverflow(n: number): FlatSlot[];
  setRestDay(n: number, opts?: { skipOverflow?: boolean }): boolean | undefined;
  /** Change a rest day's date: false unless it is a day of this week, no later than today, and `n` is a rest day. */
  setRestDate(n: number, date: string): boolean;
  swapDays(d: number, dir: number): boolean;
  setPhase(slotId: string, idx: number, ph: PhaseKey): void;
  setWeekProg(k: ProgKey): void;
  setMode(mode: Cfg['mode']): void;
  moveSlot(slotId: string, day: number): void;
  undoMove(): void;
  dismissMove(): void;
}

/** Ticking, skipping and moving cards on the board, and the order suggestions that follow. Write path of the checks: the board reorder tests cover it. */
export interface BoardSlice {
  mutateChecks(fn: (w: Week) => void, opts?: { removeLogged?: boolean; label?: string }): boolean;

  suggestOrder(slots: FlatSlot[], before: Week): void;
  canUndoOrder(): boolean;
  applyOrder(): boolean;
  undoOrder(): boolean;
  dismissOrder(): void;
  undoUncheck(): void;
  dismissUncheck(): void;
  undoSkip(): void;
  dismissSkip(): void;
  checkCard(slotId: string, on: boolean): void;
  checkItem(slotId: string, idx: number, on: boolean): void;
  checkDay(day: number, on: boolean): void;
  skipCard(slotId: string): void;
  /** Skip (or bring back) one exercise of a superset for the week; the Undo notice puts it back. */
  skipItem(slotId: string, idx: number): void;
  skipCards(ids: string[]): void;
  /** Take exercise `idx` out of a superset card and put it on the displayed day `day` for this week only (Undo in the notice). */
  moveSupersetItem(slotId: string, idx: number, day: number): boolean;
  /** Put a moved exercise (and any move made from its cards) back in its superset; what was ticked or skipped on the new cards goes back with it. */
  unmoveSupersetItem(movedId: string): boolean;
  moveCards(ids: string[], day: number): void;
}

/** Writing and editing log entries, and the lift and frequency goals. */
export interface LogSlice {
  addEntry(slotId: string, idx: number, entry: LogEntry, opts?: { check?: boolean }): boolean;
  quickLog(slotId: string, idx: number): void;
  submitLog(slotId: string, idx: number, form: LogForm): boolean;
  setLiftGoal(exId: string, key: string, raw: string | number, by?: string, from?: string, scale?: boolean): boolean;
  clearLiftGoal(exId: string, key: string): void;
  setFreqGoal(exId: string, raw: string | number): boolean;
  clearFreqGoal(exId: string): void;
  updateLog(exId: string, target: LogEntry, entry: LogEntry): boolean;
  deleteLog(exId: string, target: LogEntry): boolean;
}

/** The downloads: CSV, Excel and the full data file. */
export interface ExportSlice {
  exporting: ExportKind | null; // which export is running
  runExport(kind: ExportKind, fn: (dl: Downloads) => Promise<unknown>): Promise<void>;
  exportCsv(): Promise<void>;
  downloadExcel(which: 'all' | 'week'): Promise<void>;
  buildExportFile(kind: Exclude<ExportKind, 'csv'>): Promise<{ filename: string; data: Loose }>;
  downloadData(): Promise<void>;
}

/** The card the Program editor last moved to another day: its old day and place, and the day it went to. */
export interface EdMoved {
  key: string; from: number; to: number; idx: number; slot: ProgramSlot;
  /** Only for a move to another program: where it went (program key and name) and the card as it was, with its old id, for Undo. */
  toKey?: string; toLabel?: string; orig?: ProgramSlot;
  /** Only for one exercise taken out of a superset: `slot` is that exercise as a card of its own, `orig` the superset as it was, `ph` its phase defaults. */
  split?: { ph: Record<string, PhaseKey | null>; /** What to write back into this week (null = remove the key) if it is still the same week. */ week?: WeekPatch; weekKey?: string };
}
export interface EdRemoved { key: string; day: number; idx: number; slot: ProgramSlot }

export interface EditorSlice {
  edProg: string | null; // 'A' | 'B' (in the rotation) or 'L:<id>' (a library program); null = the one on the board
  edDay: number;
  edKey(): string;
  edItem(): LibraryItem | null;
  edProgram(): Program;
  edName(): string;
  /** `fromExp`: an Experiment entry the sheet starts from; it leaves the list once the card is saved. */
  openAddToProgram(col: number, fromExp?: string): void;
  setEdProg(edProg: string | null): void;
  setEdDay(edDay: number): void;
  /** Saves a program by key: 'A', 'B' or 'L:<library id>'. */
  saveProg(key: string, prog: Program): void;
  saveEdited(prog: Program): void;
  editProgram(fn: (prog: Program) => void): boolean;
  /** Fills the empty active program from a starter (lib/starterPrograms.ts). Returns why it could not, or null. */
  applyStarter(starterId: string, perWeek: number): string | null;
  setLibrary(library: LibraryItem[]): void;
  moveEdSlot(i: number, dir: number): void;
  /** Drag and drop in the Program editor: move the open day's card at `from` so it sits at `to`. */
  reorderEdSlot(from: number, to: number): void;
  /** The card the Program editor last removed, so its Undo notice can put it back where it was. */
  edRemoved: EdRemoved | null;
  removeEdSlot(i: number): void;
  undoRemoveEdSlot(): void;
  dismissEdRemoved(): void;
  /** The card the Program editor last moved to another day, so its notice can offer Undo. */
  edMoved: EdMoved | null;
  /** Moves the open day's card at `i` to the end of its section on day `toDay` of the same program. */
  moveEdSlotToDay(i: number, toDay: number): void;
  /** Moves the open day's card at `i` to day `toDay` of another program (or the same one: then it is `moveEdSlotToDay`). */
  moveEdSlotToProgram(i: number, toKey: string, toDay: number): void;
  /** Takes exercise `k` out of the superset at `i` on the open day and puts it, as a card of its own, on day `toDay` of the same program. */
  moveEdItemToDay(i: number, k: number, toDay: number): void;
  undoMoveEdSlot(): void;
  dismissEdMoved(): void;
  setDaySub(v: string): boolean;
  renameLibItem(raw: string): false | void;
  libSnapshot(name: string, prog: Program, from: string, auto: boolean): LibraryItem;
  saveCurrentAs(name: string): void;
  loadVersion(target: string, slot: ProgKey): void;
  deleteLibItem(id: string): void;
  /** `from` 'empty' starts with seven empty days (ADR 021); 'A' or 'B' starts as a copy of that program. */
  createProgram(name: string, from: ProgKey | 'empty'): boolean;
  saveSlot(d: SlotForm): string | null;
}

export interface SettingsSlice {
  importDraft: ImportDraft | null;
  importBusy: boolean;
  importError: string;
  importCount: number;
  setImportUseSettings(v: boolean): void;
  setImportSection(k: string, v: boolean): void;
  setPct(p: PhaseKey, raw: string | number): boolean; // false: refused (bad value, or still loading)
  setRxOverride(p: PhaseKey, raw: string): boolean;
  setRest(raw: string | number): boolean;
  setInjuryPrevention(on: boolean): void;
  setRm(exId: string, raw: string | number): boolean;
  setCfgField<K extends keyof Cfg>(k: K, v: Cfg[K]): void;
  readImportFile(file: File | null | undefined): Promise<void>;
  pasteImport(text: string): void;
  applyImport(mode: 'merge' | 'replace'): Promise<void>;
}

/** The Grocery section's add-item form: what was typed. `price` is dollars as text; `every` makes it an Every-month item (else When out). */
export interface GroceryForm { n: string; store: string; qty: string; price: string; every: boolean; note?: string; unit?: GroceryUnit | '' }

/** What the last single-item delete took out: `text` is the notice ("Removed <text>."), `restore` puts it back. */
export interface Removed { id: number; scope: string; text: string; restore: () => boolean | void }

export interface RemovedSlice {
  removed: Removed | null;
  noteRemoved(scope: string, text: string, restore: () => boolean | void): void;
  undoRemoved(): void;
  /** Drop the Undo; with a scope, only when it belongs to that list. */
  dismissRemoved(scope?: string): void;
}

/** Your food log and typed targets (ADR 086): entries are saved as the document diet/main, the targets as cfg.diet. */
export interface DietSlice {
  diet: DietEntry[];
  saveDiet(): void;
  addDietEntry(d: { d: string; n: string; kcal: number; p: number; c?: number; f?: number; from?: string }): { id: string | null; error: string | null }; // an error text (full day, bad numbers), else the new id
  updateDietEntry(id: string, patch: { n?: string; kcal?: number; p?: number; c?: number | null; f?: number | null }): string | null; // an error text, or null when saved
  removeDietEntry(id: string, undoNotice?: boolean): void; // Undo is offered (noteRemoved 'diet') unless undoNotice is false
  setDietTarget(key: 'kcal' | 'protein' | 'carbs' | 'fat', value: number | null): string | null; // null clears the typed number (the recommendation is used again); an error text, or null
}

/** Your recipes (ADR 084): saved as the document recipes/main, like the other lists. */
export interface RecipesSlice {
  recipes: Recipe[];
  saveRecipes(): void;
  saveRecipe(d: Omit<Recipe, 'id'> & { id?: string }): string | null; // create (no id) or update; an error text, or null when saved
  copyCatalogRecipe(item: CatalogItem, servings?: number): string | null; // a Library recipe joins Mine as a copy of its own (at `servings`, amounts scaled, when set)
  removeRecipe(id: string): void; // Undo is offered (noteRemoved 'recipes')
  linkIngredient(id: string, index: number, home: string | null): void; // pin one ingredient to an At home item (null unpins)
  acceptSuggestions(id: string, month: string): number; // pin every "Maybe" suggestion of one recipe at once; how many were pinned
  addMissingToGrocery(id: string, month: string): { added: number; already: number; refused: string | null }; // new names go on the list; the rest are on To get already; `refused`: why an add was refused (a full list), else null
}

/** The grocery list (ADR 039): the catalogue and every saved month, saved like every other document (synced when syncing is on). */
export interface GrocerySlice {
  grocery: Grocery;
  groceryMonths: Record<string, GroceryMonth>; // "YYYY-MM" -> that month; a month with no entry is the fresh list
  loadGrocery(): void; // syncing off: read the list from this browser's storage
  setGrocery(data: GroceryData): void; // an import replaces everything
  addGrocery(data: GroceryData): void; // an import, or this device's old list reaching the account, adds what is missing
  addGroceryItem(d: GroceryForm): string | null;
  updateGroceryItem(id: string, patch: Partial<{ n: string; store: string; qty: number; cents: number | null; every: boolean; note: string; unit: GroceryUnit | '' }>): string | null;
  removeGroceryItem(id: string): void;
  addGroceryStore(name: string): string | null;
  removeGroceryStore(name: string): string | null;
  setGroceryOut(id: string, out: boolean): void; // the At home list: unchecking "Have" puts a When-out item on this month's list
  setGroceryGot(month: string, id: string, on: boolean): boolean; // bought this month: it counts as had, and leaves that month's list; false when nothing changed
  setGroceryHave(month: string, id: string, on: boolean): void; // the At home tick: had this month, so off that month's list (ADR 054)
  setGroceryQty(month: string, id: string, qty: number): void;
  setGroceryCents(month: string, id: string, cents: number | null): void;
  setGroceryPrices(month: string, id: string, prices: number[] | null): void;
  setGroceryLineStore(month: string, id: string, store: string | null): string | null; // where it was bought that month ('' is Anywhere; its usual store or null clears the choice)
  makeGroceryStoreUsual(month: string, id: string): string | null; // Move to made permanent: the item's own store becomes the one it is in that month
  carryGroceryTicks(month: string): void; // the first time the current month (the key the screen shows as this month) opens: its At home ticks start as the latest earlier month's (ADR 079); once per month
  takeGroceryAllOff(month: string): number; // Skip all: every unticked item still to get that month is marked as had; returns how many (Undo is offered)
  takeGroceryOff(month: string, id: string): void; // not needed this month: marked as had, so off that month's list
  // Sharing what you buy with other people (groups, shares, who paid). Nothing here changes a price or a total: it only says who shares it.
  addGroceryGroup(name: string, people: string[]): string | null;
  renameGroceryGroup(id: string, name: string): string | null;
  removeGroceryGroup(id: string): void;
  addGroceryPerson(groupId: string, name: string): string | null;
  updateGroceryPerson(groupId: string, personId: string, patch: Partial<{ n: string; covered: boolean }>): string | null;
  removeGroceryPerson(groupId: string, personId: string): void;
  setGroceryStoreGroup(store: string, groupId: string | null): void; // a store defaults to one group at most
  setGroceryAllStores(groupId: string, on: boolean): void; // the group is the default for every store with no group of its own; at most one group has it
  setGroceryItemShare(id: string, share: GroceryShare | null): void; // the item's usual share; null goes back to the store's group
  setGroceryLineShare(month: string, id: string, share: GroceryShare | null): void; // this month's share for the item; null goes back to the item's
  setGroceryPackShare(month: string, id: string, index: number, share: GroceryShare | null): void; // one pack of an item priced pack by pack
  setGroceryTax(month: string, store: string, cents: number | null): void; // the receipt's sales tax for that store this month, in cents; null clears it
  setGroceryPayer(month: string, store: string, personId: string | null): void; // who paid for that store this month; null is you
  setGroceryPaid(month: string, store: string, person: string, paid: boolean): void; // an owed amount of that store this month has (or has not) been settled outside the app; amounts never change
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
  /** Adds a catalog stretch as Library only, keeping its catalog id (ADR 026). Returns an error message, or null. */
  addCatalogStretch(item: CatalogItem): string | null;
  deleteStretch(id: string): void;
  moveStretch(id: string, dir: number): void;
  saveStretchExp(d: StretchExpForm): string | null;
  deleteStretchExp(id: string): void;
  addStretchToDay(expId: string, day: number): boolean;
  /** Moves a stretch experiment into your stretches (library only, in the default group); Undo reverses it. */
  promoteStretchExp(id: string): boolean;
  removeStretchExtra(id: string): void;
  addSupplement(slot: SupplementSlot, name: string, dose?: string): boolean;
  setSupplementSlot(id: string, slot: SupplementSlot, dose?: string): boolean;
  /** Adds another instance of one of yours (same name, brand and catalog id; its own id, section and ticks) to a section, e.g. a second dose later in the day. `dose` replaces the copied one when typed. */
  addSupplementInstance(id: string, slot: SupplementSlot, dose?: string): boolean;
  removeSupplement(id: string): boolean;
  /** Adds a catalog supplement as Library only with its brand and catalog id (ADR 029). Returns an error message, or null. */
  addCatalogSupplement(item: CatalogItem, opts?: { slot?: SupplementSlot; dose?: string }): string | null;
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
  skipNote: SkipNote | null;
  moveNote: MoveNote | null;
  /** The two days a swap just changed, for about a second and a half: the Board outlines them so the change is easy to see. Never saved. */
  swapFlash: number[] | null;
  orderNote: OrderNote | null;
  orderSkip: string[]; // 'week:column' suggestions dismissed this session
  modal: Modal | null;
  weekHist: Record<string, Week> | null; // every saved week, loaded on demand for Progress and exports
  historyLoading: boolean;
  dl: Downloads | null | undefined; // undefined = not checked yet, null = unavailable
  bodySel: MuscleKey | null;
  bodySec: boolean;

  selectMuscle(m: MuscleKey | null): void;
  setBodySec(v: boolean): void;
  saveTags(exId: string, tags: MuscleTags): void;
  resetTags(exId: string): void;

  snapshot(): Snapshot;
  stretchWeeksAll(): Promise<Record<string, StretchWeek>>;
  stretchWeekKeys(): Promise<string[]>;
  fullSnapshot(): Promise<Snapshot>;
  loadHistory(): Promise<void>;
  /** Gives each past week saved before ADR 022 its record of what it ran, from what it shows now (once). */
  recordPastWeeks(): void;
  allWeeks(): Promise<Record<string, Week>>;
  isReady(): boolean;
  weekKey(): string;
  activeProgKey(): ProgKey;
  activeProgram(): Program;
  /** Whether the board shows a finished week from its record of what it ran (ADR 022), not from today's program. */
  shownFromRecord(): boolean;
  activeSlots(): FlatSlot[];
  slotById(id: string): FlatSlot | undefined;
  logTargetExists(slotId: string, idx: number): boolean;
  blocked(): boolean;
  /** What "Original" means for A or B: the blank program when syncing (ADR 016 step 2, so the owner's plan is not offered to other accounts), the built-in plan otherwise. */
  originalProgram(k: ProgKey): Program;
  /** True when A or B is still the original, i.e. nothing of the person's own would be lost by replacing it. */
  isOriginal(p: Program, k: ProgKey): boolean;

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
  /** Rewrites this week's record of what it runs (ADR 022) from today's program, when the board shows this week and it has one. */
  refreshRan(): void;



  gotoWeek(which: 'today' | 'prev' | 'next'): void;


  retryUnsaved(): void;
  eraseData(parts: { logs?: boolean; weeks?: boolean; body?: boolean; programs?: boolean; settings?: boolean }): Promise<boolean>;

  init(): Promise<void>;
}

/** The automatic backup: one copy a day for the last 7 days, in this browser (lib/autoBackup.ts). */
export interface BackupSlice {
  backups: BackupInfo[] | null;
  refreshBackups(): Promise<void>;
  backupNow(): Promise<void>;
  /** Opens a copy in the import review. */
  restoreBackup(date: string): Promise<void>;
  downloadBackup(date: string): Promise<void>;
  /** Deletes every copy (Erase everything, Delete my account). */
  forgetBackups(): Promise<void>;
  /** The days kept on the account (ADR 066); null until asked, and unused when syncing is off. */
  serverBackups: ServerBackupList | null;
  refreshServerBackups(): Promise<void>;
  /** Opens a day kept on the account in the import review. */
  restoreServerBackup(date: string): Promise<void>;
}

export type AppState = BackupSlice & BodySlice & CoreSlice & EditorSlice & ExportSlice & SettingsSlice & WellnessSlice & GrocerySlice & LibrarySlice & ProgramSlice & BoardSlice & LogSlice & RemovedSlice & RecipesSlice & DietSlice;
export type StoreSet = StoreApi<AppState>['setState'];
export type StoreGet = StoreApi<AppState>['getState'];
