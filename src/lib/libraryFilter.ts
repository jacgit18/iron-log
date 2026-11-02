// Pure rules for the Exercise and Stretch libraries (Program tab): when a search or filter is on, the count line, and which stretch groups show their rows.
export interface LibraryFilter { q?: string; eq?: string; muscle?: string; src?: string }

/** A search text or any chosen filter narrows the list. Spaces alone are not a search. */
export const isFiltering = (f: LibraryFilter): boolean => !!(f.q?.trim() || f.eq || f.muscle || f.src);

/** The status line: "12 exercises", or "3 of 12 exercises" while filtering. */
export const resultText = (shown: number, total: number, filtering: boolean, unit: string): string => (filtering ? `${shown} of ${total} ${unit}` : `${total} ${unit}`);

/** A stretch group shows its rows when the person opened it, or by default for Every day, or while searching (so a match is never hidden). */
export const groupOpen = (tier: string, userOpen: Record<string, boolean | undefined>, searching: boolean): boolean => searching || (userOpen[tier] ?? tier === 'primary');

/** The group header text: "Every day · 6". */
export const groupHeading = (label: string, count: number): string => `${label} · ${count}`;

/** Edit order (the up and down arrows on stretch rows) is only offered on the full list: a filtered list is not in order. */
export const canReorder = (filtering: boolean): boolean => !filtering;
