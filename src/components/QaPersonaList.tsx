import { useCallback, useEffect, useMemo, useState } from 'react';
import './QaPersonaList.css';
import QaScenarioTags from './QaScenarioTags.js';
import { ALL_GROUPS, filterPersonas, groupChips, groupPersonas, missingIds, parseRecent, planBadge, pushRecent, RECENT_KEY, recentRows, resetAria, rowState, seededWord, switchLabel, youAre, type QaPersonaRow } from '../lib/qaPersonas.js';
import { LS } from '../lib/storage.js';
import { flag } from '../store/useAppStore.js';
import { loadPersonas, resetPersona, switchPersona } from '../sync/qaPersonas.js';

// The QA test accounts as a list (brief qa-picker-access): search, group chips, "You are:", recent first, a seeded dot, Switch, Reset (Seed) and
// "Seed missing accounts". Used by the picker sheet and the Settings panel, so they cannot differ. The pure rules are in src/lib/qaPersonas.ts.
const UNREACHABLE = 'Could not reach the server. Nothing changed.';

export default function QaPersonaList({ idPrefix, highlight = null }: { idPrefix: string; highlight?: string | null }) {
  const [rows, setRows] = useState<QaPersonaRow[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [canReset, setCanReset] = useState(false);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(ALL_GROUPS);
  const [busy, setBusy] = useState<string | null>(null);
  const [recent] = useState(() => parseRecent(LS.get(RECENT_KEY)));

  const load = useCallback(async () => {
    const out = await loadPersonas();
    if (!out) { setFailed(true); return; }
    setFailed(false);
    setRows(out.personas);
    setCurrent(out.current);
    setCanReset(out.canReset);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const chips = useMemo(() => groupChips(rows ?? []), [rows]);
  const shown = useMemo(() => filterPersonas(rows ?? [], query, group), [rows, query, group]);
  const groups = useMemo(() => groupPersonas(shown), [shown]);
  const showRecent = !query.trim() && group === ALL_GROUPS;
  const recents = useMemo(() => recentRows(rows ?? [], recent), [rows, recent]);
  const missing = useMemo(() => missingIds(rows ?? [], current), [rows, current]);

  const go = async (p: QaPersonaRow) => {
    setBusy(p.id);
    const out = await switchPersona(p.id);
    if (out === 'ok') { LS.set(RECENT_KEY, pushRecent(recent, p.id)); window.location.reload(); return; } // the page holds the previous account's data; the reload meets the app's own check
    setBusy(null);
    flag(out === 'unreachable' ? UNREACHABLE : `Could not switch to ${p.name}. Has it been seeded?`);
  };
  const reset = async (p: QaPersonaRow) => {
    setBusy(p.id);
    const out = await resetPersona(p.id);
    if (out === 'ok') { flag(`${p.seeded ? 'Reset' : 'Seeded'} ${p.name}`); await load(); } else flag(out === 'unreachable' ? UNREACHABLE : `Could not ${p.seeded ? 'reset' : 'seed'} ${p.name}. It is as it was.`);
    setBusy(null);
  };
  const seedMissing = async () => {
    setBusy('missing');
    let done = 0;
    for (const id of missing) {
      const out = await resetPersona(id);
      if (out !== 'ok') { flag(out === 'unreachable' ? UNREACHABLE : `Seeded ${done} of ${missing.length}, then stopped at ${rows?.find(r => r.id === id)?.name ?? id}.`); await load(); setBusy(null); return; }
      done++;
    }
    flag(`Seeded ${done} test account${done === 1 ? '' : 's'}`);
    await load();
    setBusy(null);
  };

  // The account a link asked for scrolls into view once the list is drawn.
  const marked = useCallback((el: HTMLLIElement | null) => { el?.scrollIntoView({ block: 'nearest' }); }, []);
  const row = (p: QaPersonaRow, key: string) => {
    const st = rowState(p, current, canReset);
    const working = busy === p.id;
    return (
      <li key={key} className={`qarow${st.current ? ' cur' : ''}${highlight === p.id ? ' hl' : ''}`} ref={highlight === p.id && key === p.id ? marked : undefined}>
        <div className="qatext">
          <div className="qaname">
            <span className={`qadot${p.seeded ? ' on' : ''}`} aria-hidden="true" />
            <b>{p.name}</b>
            <span className="qabadge">{planBadge(p.plan, p.planStatus)}</span>
            {st.current && <span className="qabadge">Current</span>}
            <span className="vh">{seededWord(p.seeded)}</span>
          </div>
          <p className="qadesc">{p.scenario}</p>
          <p className="qatry">Try: {p.tryThis}</p>
          {st.hint && <p className="qahint">{st.hint}</p>}
          <QaScenarioTags row={p} idPrefix={`${idPrefix}-${key}`} />
        </div>
        <div className="qaacts">
          <button type="button" className="btn sm" disabled={busy !== null || !st.canSwitch} aria-label={switchLabel(p.name)} onClick={() => void go(p)}>Switch</button>
          {canReset && <button type="button" className="btn sm" disabled={busy !== null || !st.canReset} aria-label={resetAria(p.name, p.seeded)} onClick={() => void reset(p)}>{working ? (p.seeded ? 'Resetting…' : 'Seeding…') : st.resetLabel}</button>}
        </div>
      </li>
    );
  };

  if (failed && !rows) return <p className="notice" role="status">Could not load the test accounts. <button type="button" className="btn sm" onClick={() => void load()}>Retry</button></p>;
  if (!rows) return <p className="note" role="status">Loading…</p>;
  const inputId = `${idPrefix}-search`;
  return (
    <div className="qalistwrap">
      <p className="qayou" aria-live="polite">{youAre(rows, current)}</p>
      <label className="field qasearch" htmlFor={inputId}>
        <span className="vh">Search test accounts</span>
        <input id={inputId} type="search" placeholder="Search test accounts" value={query} onChange={e => setQuery(e.target.value)} autoComplete="off" />
      </label>
      <div className="qachips" role="group" aria-label="Filter by group">
        {chips.map(c => <button key={c} type="button" className={`qachip${group === c ? ' on' : ''}`} aria-pressed={group === c} onClick={() => setGroup(c)}>{c}</button>)}
      </div>
      <div className="qagroups">
        {showRecent && recents.length > 0 && (
          <div role="group" aria-label="Recent">
            <h4 className="qagroup">Recent</h4>
            <ul className="qalist">{recents.map(p => row(p, `recent-${p.id}`))}</ul>
          </div>
        )}
        {groups.map(g => (
          <div key={g.group} role="group" aria-label={g.group}>
            <h4 className="qagroup">{g.group}</h4>
            <ul className="qalist">{g.items.map(p => row(p, p.id))}</ul>
          </div>
        ))}
        {!groups.length && <p className="note" role="status">No test accounts match</p>}
      </div>
      {canReset && missing.length > 0 && (
        <div className="qafoot">
          <button type="button" className="btn sm" disabled={busy !== null} onClick={() => void seedMissing()}>{busy === 'missing' ? 'Seeding…' : 'Seed missing accounts'}</button>
          <span className="qahint">{missing.length} not seeded</span>
        </div>
      )}
    </div>
  );
}
