/** How many of the Board's two filters are on: a muscle sort and an equipment filter. */
export const boardFilterCount = (f: { muscle: string; eq: string }): number => (f.muscle ? 1 : 0) + (f.eq ? 1 : 0);

/** The phone's one-line summary under the Injury prevention row: "Chest first · Barbell". Empty when nothing is on. */
export const boardFilterSummary = (muscleName: string, eqLabel: string): string =>
  [muscleName ? `${muscleName} first` : '', eqLabel].filter(Boolean).join(' · ');
