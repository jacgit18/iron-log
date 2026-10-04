// Where you were in the app, kept for this browser tab only so a refresh puts you back. A fresh
// open starts clean (board, current week). The week itself is never kept: it always opens on today's.
const KEY = 'ironlog-view';
const TABS = ['board', 'daily', 'progress', 'program', 'settings'];

export function loadView(day) {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY));
    if (!v || typeof v !== 'object') return {};
    const out = {};
    if (TABS.includes(v.tab)) out.tab = v.tab;
    // The phone's day picker only makes sense on the day it was set.
    if (v.day === day && Number.isInteger(v.mDay) && v.mDay >= 1 && v.mDay <= 7) out.mDay = v.mDay;
    return out;
  } catch { return {}; }
}

export function saveView(day, { tab, mDay }) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ tab, mDay, day })); } catch { /* private mode: just don't remember */ }
}
