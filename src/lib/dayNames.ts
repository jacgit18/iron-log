import { parseDate, weekStartOf, ymd } from '../shared/dates.js';

/* Day names shared by the Nutrition board and the day picker (a leaf module, so the two never import each other). */

/** "Sat 14". */
export const shortDay = (day: string): string => { const d = parseDate(day); return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`; };

/** The Sunday that starts the week `day` is in (weeks are Sunday to Saturday). */
export const sundayOf = (day: string): string => ymd(weekStartOf(parseDate(day)));

/** "Sat 14 · today": a day's name, with today marked. */
export const dayLabel = (day: string, today: string): string => `${shortDay(day)}${day === today ? ' · today' : ''}`;
