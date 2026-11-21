import type { UsageOverview } from '../shared/usage.js';

/** "50%" for a return-rate row, "n/a" while nobody is old enough to have been counted. */
export const returnRate = (r: UsageOverview['retention'][number]): string => (r.eligible ? `${Math.round((r.returned / r.eligible) * 100)}%` : 'n/a');

/** The feature table: event columns (sorted), version rows (newest text first) and the total for each cell, 0 where nothing was counted. */
export function featureTable(features: UsageOverview['features']): { events: string[]; versions: string[]; total: (version: string, event: string) => number } {
  const events = [...new Set(features.map(f => f.event))].sort();
  const versions = [...new Set(features.map(f => f.version))].sort().reverse();
  const total = (version: string, event: string) => features.find(f => f.version === version && f.event === event)?.total ?? 0;
  return { events, versions, total };
}
