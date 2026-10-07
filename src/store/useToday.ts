import { create } from 'zustand';
import { ymd } from '../shared/dates.js';

// Today's date as app state, so "this week", the history and the month grid move on when the day
// changes, including when the installed app is left open overnight.
export const useToday = create<{ today: Date }>(() => ({ today: new Date() }));

function refresh() {
  const now = new Date();
  if (ymd(now) !== ymd(useToday.getState().today)) useToday.setState({ today: now });
}
if (typeof window !== 'undefined') {
  setInterval(refresh, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
}
