import { signIn } from '../sync/devUser.js';
import type { UsageOverview } from '../shared/usage.js';

// The admin Usage screen's call to /api/usage-admin. Nothing here is stored: it is read from the server each time, and every failure
// comes back as a plain reason, never a throw, so the screen can say what happened.
export type UsageFailure = { ok: false; reason: 'failed' | 'forbidden' | 'offline' };

export async function loadUsage(days: number): Promise<({ ok: true } & UsageOverview) | UsageFailure> {
  let res: Response;
  try {
    res = await fetch(`/api/usage-admin?days=${days}`, { headers: { 'x-client-version': __APP_VERSION__, ...signIn() } });
  } catch { return { ok: false, reason: 'offline' }; }
  if (res.status === 403) return { ok: false, reason: 'forbidden' };
  if (!res.ok) return { ok: false, reason: 'failed' };
  try {
    const j = (await res.json()) as Partial<UsageOverview>;
    return Array.isArray(j.days) && Array.isArray(j.retention) && Array.isArray(j.features) && typeof j.installs === 'number'
      ? { ok: true, days: j.days, retention: j.retention, features: j.features, installs: j.installs }
      : { ok: false, reason: 'failed' };
  } catch { return { ok: false, reason: 'failed' }; }
}
