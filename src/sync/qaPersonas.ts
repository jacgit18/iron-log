import { parsePersonaList } from '../lib/qaPersonas.js';
import { SWITCH_MARK_KEY, switchMark } from '../lib/qaSwitchWipe.js';

/* ---------- QA test accounts: the four calls (brief qa-persona-picker, server/auth/qaPersonas.ts) ----------
   Same-origin, cookie only. Like the rest of src/sync none of these throws: a network failure is an answer. */

export type SwitchOutcome = 'ok' | 'refused' | 'unreachable';

const call = (path: string, init: RequestInit) => fetch(`/api/auth/qa/personas${path}`, { credentials: 'same-origin', headers: { accept: 'application/json', 'content-type': 'application/json' }, ...init });

export async function loadPersonas() {
  try {
    const res = await call('', { method: 'GET' });
    return res.ok ? parsePersonaList(await res.json().catch(() => undefined)) : null;
  } catch {
    return null;
  }
}

async function post(path: string, body: unknown): Promise<SwitchOutcome> {
  try {
    const res = await call(path, { method: 'POST', body: JSON.stringify(body) });
    return res.ok ? 'ok' : res.status >= 500 || res.status === 429 ? 'unreachable' : 'refused';
  } catch {
    return 'unreachable';
  }
}

/** After a switch or Return that worked, leave a stamp for the reload to read (lib/qaSwitchWipe.ts); a failed call leaves none. */
async function postSwitch(path: string, body: unknown): Promise<SwitchOutcome> {
  const out = await post(path, body);
  if (out === 'ok') try { sessionStorage.setItem(SWITCH_MARK_KEY, switchMark(Date.now())); } catch { /* the card then asks, as before */ }
  return out;
}

export const switchPersona = (id: string) => postSwitch('/switch', { id });
export const resetPersona = (id: string) => post('/reset', { id });
export const returnToAdmin = () => postSwitch('/return', {});
