/* ---------- QA test accounts: what the screen shows (brief: qa-persona-picker) ----------
   Pure rules for the admin-only list on a QA service; the component only draws what these return. */

export interface QaPersonaRow {
  id: string;
  name: string;
  group: string;
  plan: string;
  planStatus: string | null;
  scenario: string;
  tryThis: string;
  /** The account exists on the server (it was seeded). */
  seeded: boolean;
  /** The QA scenarios that run as this account (brief: qa-scenarios); none when it has no tag. */
  scenarios: QaScenarioRef[];
}

export interface QaScenarioRef { id: string; title: string }

export interface QaPersonaGroup { group: string; items: QaPersonaRow[] }

const GROUP_ORDER = ['Plans', 'Limits', 'Data volume', 'Features', 'Diet'];
const PLAN_NAMES: Record<string, string> = { beta: 'Beta', founder: 'Founder', free: 'Free', lifetime: 'Lifetime', paid: 'Paid' };

/** The groups in the order they are shown (a group the screen does not know goes last), each keeping the server's order inside it. */
export function groupPersonas(rows: readonly QaPersonaRow[]): QaPersonaGroup[] {
  const groups = new Map<string, QaPersonaRow[]>();
  for (const r of rows) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
  const rank = (g: string) => (GROUP_ORDER.includes(g) ? GROUP_ORDER.indexOf(g) : GROUP_ORDER.length);
  return [...groups].map(([group, items]) => ({ group, items })).sort((a, b) => rank(a.group) - rank(b.group));
}

/** The plan badge: the plan, and "past due" when the payment failed. */
export function planBadge(plan: string, status: string | null): string {
  const name = PLAN_NAMES[plan] ?? plan;
  return status === 'past_due' ? `${name}, past due` : name;
}

/** What the banner says while a test account is signed in. */
export const bannerText = (name: string): string => `QA test account: ${name}`;

/** The scenario refs of one row; anything that is not a list of `{ id, title }` strings is no list (an old server sends none). */
function parseScenarios(v: unknown): QaScenarioRef[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap(x => (x && typeof x === 'object' && typeof (x as QaScenarioRef).id === 'string' && typeof (x as QaScenarioRef).title === 'string' ? [{ id: (x as QaScenarioRef).id, title: (x as QaScenarioRef).title }] : []));
}

/** Reads the list route's answer, or null when it is not one (an error page, an old server). */
export function parsePersonaList(body: unknown): { current: string | null; canReset: boolean; personas: QaPersonaRow[] } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as { current?: unknown; personas?: unknown };
  if (!Array.isArray(b.personas)) return null;
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  const personas = b.personas
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && typeof (p as Record<string, unknown>).id === 'string' && typeof (p as Record<string, unknown>).name === 'string')
    .map(p => ({ id: s(p.id), name: s(p.name), group: s(p.group) || 'Other', plan: s(p.plan), planStatus: typeof p.planStatus === 'string' ? p.planStatus : null, scenario: s(p.scenario), tryThis: s(p.tryThis), seeded: p.seeded !== false, scenarios: parseScenarios(p.scenarios) }));
  return { current: typeof b.current === 'string' ? b.current : null, canReset: (body as { canReset?: unknown }).canReset === true, personas };
}

/* ---------- The picker (brief: qa-picker-access) ---------- */

export const ALL_GROUPS = 'All';
export const RECENT_MAX = 3;
export const RECENT_KEY = 'qa-recent';

/** Where the picker may be opened: the account menu row for an admin on their own account, the banner button on a test account. */
export function qaEntries(qa: { persona: string | null; canSwitch: boolean } | undefined): { menuRow: boolean; bannerSwitch: boolean } {
  return { menuRow: qa?.canSwitch === true, bannerSwitch: !!qa?.persona };
}

/** The chips above the list: All, then the groups present, in the screen's order. */
export const groupChips = (rows: readonly QaPersonaRow[]): string[] => [ALL_GROUPS, ...groupPersonas(rows).map(g => g.group)];

/** Rows matching the search (case-blind, on name, scenario, "try this", and the ids and titles of the QA scenarios) and the group chip. */
export function filterPersonas(rows: readonly QaPersonaRow[], query: string, group: string): QaPersonaRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter(r => (group === ALL_GROUPS || r.group === group) && (!q || `${r.name} ${r.scenario} ${r.tryThis} ${r.scenarios.map(s => `${s.id} ${s.title}`).join(' ')}`.toLowerCase().includes(q)));
}

/** The recent accounts that still exist, in recent order. */
export function recentRows(rows: readonly QaPersonaRow[], recent: readonly string[]): QaPersonaRow[] {
  return recent.flatMap(id => rows.filter(r => r.id === id));
}

/** The recent list after switching to `id`: it goes first, no repeats, at most RECENT_MAX. */
export const pushRecent = (recent: readonly string[], id: string): string[] => [id, ...recent.filter(x => x !== id)].slice(0, RECENT_MAX);

/** Reads the saved recent ids; anything that is not a list of strings is no recent list. */
export function parseRecent(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : [];
}

export interface QaRowState {
  current: boolean;
  /** Switch is enabled: the account exists and is not the one you are on. */
  canSwitch: boolean;
  /** Reset (or Seed) is enabled: the server can do it and it is not the account you are on. */
  canReset: boolean;
  resetLabel: 'Reset' | 'Seed';
  /** The small line under the row, or null. */
  hint: string | null;
}

export function rowState(r: Pick<QaPersonaRow, 'id' | 'seeded'>, currentId: string | null, serverCanReset: boolean): QaRowState {
  const current = r.id === currentId;
  return {
    current,
    canSwitch: r.seeded && !current,
    canReset: serverCanReset && !current,
    resetLabel: r.seeded ? 'Reset' : 'Seed',
    hint: current ? 'Switch away to reset it' : !r.seeded ? 'Seed it first' : null,
  };
}

/** The accounts "Seed missing accounts" will seed, in list order (not the one you are on). */
export const missingIds = (rows: readonly QaPersonaRow[], currentId: string | null): string[] => rows.filter(r => !r.seeded && r.id !== currentId).map(r => r.id);

export const youAre = (rows: readonly QaPersonaRow[], currentId: string | null): string => `You are: ${rows.find(r => r.id === currentId)?.name ?? 'your own account'}`;
export const seededWord = (seeded: boolean): string => (seeded ? 'Seeded' : 'Not seeded');
export const switchLabel = (name: string): string => `Switch to ${name}`;
export const resetAria = (name: string, seeded: boolean): string => `${seeded ? 'Reset' : 'Seed'} ${name}`;

/* ---------- Scenario tags (brief: qa-scenarios) ---------- */

/** The tag line under a row: "Used in S-04, S-11", or null when the account has no scenario. */
export const scenarioTag = (r: Pick<QaPersonaRow, 'scenarios'>): string | null => (r.scenarios.length ? `Used in ${r.scenarios.map(s => s.id).join(', ')}` : null);

/** The label of the expand button: how many scenarios, so a screen reader hears more than "Scenarios". */
export const scenarioToggleLabel = (r: Pick<QaPersonaRow, 'name' | 'scenarios'>, open: boolean): string => `${open ? 'Hide' : 'Show'} ${r.scenarios.length} scenario${r.scenarios.length === 1 ? '' : 's'} for ${r.name}`;

/** Copy for a row with nothing to run. */
export const NO_SCENARIOS = 'No scenarios yet';
