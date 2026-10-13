/* ---------- A note that outlives one reload ----------
   Erasing everything or deleting the account reloads the page straight after, so a message set before it was lost: it said nothing
   happened when everything had. The note is kept in sessionStorage (this tab only, gone when the tab closes) and taken once after. */
const KEY = 'ironlog:after-reload';

export function noteAfterReload(text: string): void {
  try { sessionStorage.setItem(KEY, text); } catch { /* storage unavailable: the reload still happens */ }
}

/** The note, once: reading it removes it. */
export function takeAfterReload(): string {
  try { const t = sessionStorage.getItem(KEY) || ''; sessionStorage.removeItem(KEY); return t; } catch { return ''; }
}
