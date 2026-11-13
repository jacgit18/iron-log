// Opt-in anonymous usage counts (brief opt-in-usage-counts). The one list of what may be counted, for the phone and the server; the
// database function record_usage (migration 20261028000001) names the same six. A name not here is never sent and never stored.
export const USAGE_EVENTS = ['app_open', 'export_used', 'program_edited', 'push_on', 'sync_on', 'workout_logged'] as const;
export type UsageEvent = (typeof USAGE_EVENTS)[number];

/** Largest count kept for one event in one day, on the phone and in the database. */
export const USAGE_MAX_COUNT = 1000;

export type UsageCounts = Partial<Record<UsageEvent, number>>;

/** What the phone sends, at most once per UTC day: a random install id, the build, whether it came from the Android app, the counts. */
export interface UsageReport {
  id: string;
  version: string;
  fromApp: boolean;
  counts: UsageCounts;
}

/** What the admin Usage screen shows (server list_usage, migration 20261028000001). */
export interface UsageOverview {
  days: { day: string; installs: number; fromApp: number }[];
  retention: { after: number; eligible: number; returned: number }[];
  features: { version: string; event: string; total: number }[];
  installs: number;
}
