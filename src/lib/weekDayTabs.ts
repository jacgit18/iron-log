/* The joined week and day card on a phone (brief week-day-joined-tabs): what the day tabs hold and how the keyboard moves between them. Pure; WeekDayCard.tsx draws it. */
import { weekDays, type WeekOffset } from './nutritionBoard.js';
import { parseDate } from '../shared/dates.js';

/** One day tab. `id` is what the screen's own state calls the day (Board: "1".."7", Stretches: "0".."6", Nutrition: "2026-09-19"). */
export interface DayTab {
  id: string;
  /** The first line: "D1", "Sun". */
  head: string;
  /** The second line: a count, "Rest", a check, or the date number. */
  sub: string;
  /** Starts with the visible text so voice control can say what it sees (WCAG 2.5.3). */
  label: string;
  /** Done, rest or skipped: the second line takes the accent colour. */
  done?: boolean;
  /** Today on Nutrition: marked with a dot. */
  today?: boolean;
  /** A day that just swapped on the Board keeps its flash on the tab. */
  swapped?: boolean;
}

/** The tab a key moves to (Arrow keys wrap, Home and End jump), or null for any other key. */
export function tabAfterKey(key: string, at: number, count: number): number | null {
  if (count < 1) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowRight') return (at + 1) % count;
  if (key === 'ArrowLeft') return (at - 1 + count) % count;
  return null;
}

const weekday = (d: string, style: 'short' | 'long') => parseDate(d).toLocaleDateString('en-US', { weekday: style });

/** The seven tabs of the Nutrition week shown: weekday over the date number, today marked. */
export function nutritionTabs(today: string, offset: WeekOffset): DayTab[] {
  return weekDays(today, offset).map(id => {
    const n = String(parseDate(id).getDate()), head = weekday(id, 'short'), isToday = id === today;
    return { id, head, sub: n, label: `${head} ${n}: ${weekday(id, 'long')} ${n}${isToday ? ', today' : ''}`, today: isToday };
  });
}
