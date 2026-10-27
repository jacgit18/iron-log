import { parsePersonaList } from '../lib/qaPersonas.js';

/* ---------- QA test accounts: the three calls (brief qa-persona-picker, server/auth/qaPersonas.ts) ----------
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

export const switchPersona = (id: string) => post('/switch', { id });
export const returnToAdmin = () => post('/return', {});
