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
}

export interface QaPersonaGroup { group: string; items: QaPersonaRow[] }

const GROUP_ORDER = ['Plans', 'Limits', 'Data volume', 'Features'];
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

/** Reads the list route's answer, or null when it is not one (an error page, an old server). */
export function parsePersonaList(body: unknown): { current: string | null; personas: QaPersonaRow[] } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as { current?: unknown; personas?: unknown };
  if (!Array.isArray(b.personas)) return null;
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  const personas = b.personas
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && typeof (p as Record<string, unknown>).id === 'string' && typeof (p as Record<string, unknown>).name === 'string')
    .map(p => ({ id: s(p.id), name: s(p.name), group: s(p.group) || 'Other', plan: s(p.plan), planStatus: typeof p.planStatus === 'string' ? p.planStatus : null, scenario: s(p.scenario), tryThis: s(p.tryThis) }));
  return { current: typeof b.current === 'string' ? b.current : null, personas };
}
