import { useEffect, useMemo, useState } from 'react';
import './QaAccountsPanel.css';
import { groupPersonas, planBadge, type QaPersonaRow } from '../../lib/qaPersonas.js';
import { flag } from '../../store/useAppStore.js';
import { loadPersonas, switchPersona } from '../../sync/qaPersonas.js';
import { useQa } from '../../sync/qaState.js';

// QA test accounts (brief qa-persona-picker): an admin on a QA service sees the seeded accounts, described, and switches to one. Draws nothing
// anywhere else: /api/me only says `qa.canSwitch` on QA, to an admin. The list comes from the server (server/qa/personas.ts), so it cannot
// drift from what the seed script made.
export default function QaAccountsPanel() {
  const qa = useQa();
  const canSwitch = qa?.canSwitch === true;
  const [rows, setRows] = useState<QaPersonaRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!canSwitch) return;
    let current = true;
    void loadPersonas().then(out => { if (!current) return; if (out) setRows(out.personas); else setFailed(true); });
    return () => { current = false; };
  }, [canSwitch]);
  const groups = useMemo(() => groupPersonas(rows ?? []), [rows]);
  if (!canSwitch) return null;

  const go = async (p: QaPersonaRow) => {
    setBusy(p.id);
    const out = await switchPersona(p.id);
    if (out === 'ok') { window.location.reload(); return; } // the page holds the admin's data; the reload meets the app's own check for another account
    setBusy(null);
    flag(out === 'unreachable' ? 'Could not reach the server. Nothing changed.' : `Could not switch to ${p.name}. Has it been seeded?`);
  };

  return (
    <section className="panel qapanel" aria-labelledby="qa-h">
      <h3 id="qa-h">QA test accounts</h3>
      <p className="note">Switch to a seeded account to see the app as that user. The banner at the top brings you back. Because this device holds your own data, the app then asks to wipe it and carry on as the test account; your account keeps its data on the server.</p>
      {failed && <p className="notice" role="status">Could not load the test accounts. Reload to try again.</p>}
      {!failed && !rows && <p className="note" role="status">Loading…</p>}
      {rows && (
        <details>
          <summary>Show the {rows.length} test accounts</summary>
          {groups.map(g => (
            <div key={g.group} role="group" aria-label={g.group}>
              <h4 className="qagroup">{g.group}</h4>
              <ul className="qalist">
                {g.items.map(p => (
                  <li key={p.id} className="qarow">
                    <div className="qatext">
                      <div className="qaname"><b>{p.name}</b> <span className="qabadge">{planBadge(p.plan, p.planStatus)}</span></div>
                      <p className="qadesc">{p.scenario}</p>
                      <p className="qatry">Try: {p.tryThis}</p>
                    </div>
                    <button type="button" className="btn sm" disabled={busy !== null} aria-label={`Switch to ${p.name}`} onClick={() => void go(p)}>{busy === p.id ? 'Switching…' : 'Switch'}</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
