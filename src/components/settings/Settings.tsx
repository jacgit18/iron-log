import AccountPanel from './AccountPanel.js';
import DeleteMyData from './DeleteMyData.js';
import FeedbackPanel from './FeedbackPanel.js';
import SyncPanel from './SyncPanel.js';
import type { Appearance } from '../../lib/appearance.ts';
import type { Cfg } from '../../types.ts';
import type { PhaseKey, ProgKey } from '../../types.ts';
import { useState, type ReactNode } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useFeature } from '../../features.js';
import { useToday } from '../../store/useToday.js';
import { PHASES, PH_KEYS, slotsFor, exInfo, allExIds } from '../../lib/data.js';
import { MON } from '../../shared/dates.js';
import { programFor, progName, programWeights, bestByPhase, round } from '../../lib/logic.js';
import CommitInput from '../CommitInput.jsx';
import ArmedButton from '../ArmedButton.jsx';
import { motionOK } from '../../lib/motion.js';
import { getAppearance, setAppearance } from '../../lib/appearance.js';
import { notifySupported, restNotifyOn, setRestNotify } from '../../lib/restNotify.js';
import { usePwa, install, keepData, isIOS } from '../../lib/pwa.js';
import { IMPORT_ACCEPT } from '../../lib/importFile.js';

function ModePanel() {
  const cfg = useAppStore(s => s.cfg); const st = useAppStore.getState();
  const now = useToday(s => s.today); const yr = now.getFullYear();
  const a = progName(cfg, 'A'), b = progName(cfg, 'B');
  const modes = [[1, `${a} only`, `Run ${a} every week.`], [2, 'Alternate monthly', `${a} and ${b} take turns by month.`], [3, 'Swap every 6 months', 'Six months on one program, then six on the other.']];
  return (
    <section className="panel">
      <h3>Program mode</h3>
      <div className="modes">
        {modes.map(([m, t, dsc]) => (
          <label className="mode" key={m}>
            <input type="radio" name="mode" id={`mode-${m}`} value={m} checked={cfg.mode === m} onChange={() => st.setMode(m as 1 | 2 | 3)} />
            <div><b>Mode {m} · {t}</b><span>{dsc}</span></div>
          </label>
        ))}
      </div>
      {cfg.mode === 3 && (
        <div className="inline" style={{ flexWrap: 'wrap' }}>
          <label htmlFor="m3s">First block starts in</label>
          <select id="m3s" className="btn sm" value={cfg.m3Start} onChange={e => st.setCfgField('m3Start', Number(e.target.value))}>
            {MON.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <label htmlFor="m3f">on</label>
          <select id="m3f" className="btn sm" value={cfg.m3First} onChange={e => st.setCfgField('m3First', e.target.value as ProgKey)}>
            {['A', 'B'].map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
      )}
      {cfg.mode === 2 && (
        <div className="inline">
          <label htmlFor="m2e">Even months run</label>
          <select id="m2e" className="btn sm" value={cfg.m2Even} onChange={e => st.setCfgField('m2Even', e.target.value as ProgKey)}>
            {['A', 'B'].map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
      )}
      <p>{yr} at a glance. Weeks run Sunday to Saturday; a week follows the month its Sunday falls in. In Mode 2 you can also switch a single week to A or B from the board.</p>
      <div className="months">
        {MON.map((m, i) => { const p = programFor(cfg, new Date(yr, i, 1)); return <div key={m} className={`${p === 'B' ? 'b' : ''}${i === now.getMonth() ? ' now' : ''}`}><span className="sr">{m}: Program {p}</span><span aria-hidden="true">{m[0]}<br />{p}</span></div>; })}
      </div>
    </section>
  );
}

function AppearancePanel() {
  const [a, setA] = useState(getAppearance);
  const upd = (patch: Partial<Appearance>) => setA(setAppearance(patch));
  return (
    <section className="panel">
      <h3>Appearance</h3>
      <fieldset className="plain">
        <legend>Colours</legend>
        <div className="modes">
          {[['system', 'Match this device', 'Light or dark, following your system setting.'], ['light', 'Light', 'Dark text on a light background.'], ['dark', 'Dark', 'Light text on a dark background.']].map(([k, t, d]) => (
            <label className="mode" key={k}>
              <input type="radio" name="theme" value={k} checked={a.theme === k} onChange={() => upd({ theme: k as Appearance['theme'] })} />
              <div><b>{t}</b><span>{d}</span></div>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="inline"><input type="checkbox" checked={a.roomy} onChange={e => upd({ roomy: e.target.checked })} /> Roomier text (more space between lines and paragraphs)</label>
      <p>Saved on this device only.</p>
    </section>
  );
}

function RestAlertPanel() {
  const [on, setOn] = useState(restNotifyOn);
  const [note, setNote] = useState('');
  if (!notifySupported()) return null; // e.g. iPhone Safari outside an installed app
  const toggle = async (want: boolean) => {
    const r = await setRestNotify(want);
    setOn(r === 'on');
    setNote(r === 'denied' ? 'Notifications are blocked for Iron Log. Allow them in your browser or phone settings, then try again.' : '');
  };
  return (
    <section className="panel">
      <h3>Rest timer alert</h3>
      <label className="inline"><input type="checkbox" checked={on} onChange={e => void toggle(e.target.checked)} /> Show a notification when a rest or hold ends while Iron Log is in the background</label>
      <p>It only shows while the phone still lets Iron Log run in the background. If the screen has been locked for a while the alert can be late, and the timer is right when you open the app again. Saved on this device only.</p>
      {note && <p role="status">{note}</p>}
    </section>
  );
}

function DevicePanel() {
  const { installEvent, installed, persisted } = usePwa();
  const storeMode = useAppStore(s => s.storeMode);
  return (
    <section className="panel">
      <h3>App on this device</h3>
      {installed ? <p>Iron Log is installed. It opens from your home screen and works without a connection.</p>
        : installEvent ? (
          <>
            <p>Install Iron Log to open it from your home screen like any other app. It works without a connection.</p>
            <div className="actions"><button type="button" className="btn primary" onClick={install}>Install app</button></div>
          </>
        ) : isIOS() ? (
          <>
            <p>To install on iPhone or iPad, open this page in Safari, then:</p>
            <ol className="helpsteps"><li>Tap the Share button.</li><li>Tap <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>.</li></ol>
          </>
        ) : <p>This page already works offline once loaded. To install it, use your browser's “Install app” or “Add to Home screen” menu item.</p>}
      {/* Where the data lives, said plainly: synced, the account holds it and exporting is optional; local, this browser is the only copy. */}
      {storeMode === 'db' && <p>Your data is saved to your account and syncs to your other devices. This device keeps a copy too, so the app works offline; changes made offline are sent when you're back online.</p>}
      {storeMode === 'local' && (persisted
        ? <p>Your data is saved in this browser only (it isn't synced to an account), and the browser won't clear it to free up space.</p>
        : persisted === false ? (
          <>
            <p>Your data is saved in this browser only (it isn't synced to an account). If the device runs very low on space, the browser may clear it, so keep a copy with Export all data now and then, or keep it with the button below.</p>
            <div className="actions"><button type="button" className="btn" onClick={keepData}>Keep my data on this device</button></div>
          </>
        ) : <p>Your data is saved in this browser only (it isn't synced to an account).</p>)}
    </section>
  );
}

function PhasePanel() {
  const cfg = useAppStore(s => s.cfg); const st = useAppStore.getState();
  return (
    <section className="panel">
      <h3>Phases</h3>
      <p>Each phase has default sets × reps. The target weight starts from the weight you last logged for that exercise in that phase, otherwise the program's weight. The % of 1RM is only for comparing with your 1RM below; it doesn't set targets.</p>
      {/* One row per phase, each field labelled in place: a table's three columns wrapped the % under its box on a phone. */}
      <div className="phrows">
        {PH_KEYS.map(k => {
          const pct = cfg.pct[k] ?? PHASES[k].pct; const rx = cfg.rxOverride[k] || PHASES[k].rx;
          return (
            <div className="phrow" key={k}>
              <span className="phname"><span className="dot" data-p={k} /> {PHASES[k].label}</span>
              {PHASES[k].pct === 0
                ? <div className="phfield"><span>% of 1RM</span><span className="pctin">—</span></div>
                : <label className="phfield"><span>% of 1RM</span><span className="pctin"><CommitInput key={`${k}:${pct}`} type="number" id={`pct-${k}`} aria-label={`${PHASES[k].label} % of 1RM`} min="0" max="110" step="1" value={pct} onCommit={(v) => st.setPct(k, v)} /> %</span></label>}
              <label className="phfield"><span>Sets × reps</span><CommitInput key={`${k}:${rx}`} className="wide" id={`rx-${k}`} aria-label={`${PHASES[k].label} sets × reps`} value={rx} onCommit={(v) => st.setRxOverride(k, v)} /></label>
            </div>
          );
        })}
      </div>
      <label className="inline" htmlFor="rest-s">Rest between sets{' '}
        <CommitInput key={`rest:${cfg.rest ?? 90}`} type="number" id="rest-s" min="0" max="600" step="any" value={cfg.rest ?? 90} style={{ width: 80 }} onCommit={st.setRest} /> seconds
      </label>
      <p>The percentages are placeholders until you set your own. Isometric holds are usually judged by time and effort more than by % of a lifting max.</p>
    </section>
  );
}

function DataPanel() {
  const dl = useAppStore(s => s.dl); const exporting = useAppStore(s => s.exporting); const st = useAppStore.getState();
  const storeMode = useAppStore(s => s.storeMode);
  const importError = useAppStore(s => s.importError);
  const [paste, setPaste] = useState('');
  return (
    <section className="panel" aria-labelledby="data-h">
      <h3 id="data-h">Export &amp; import</h3>
      <p>{storeMode === 'db' ? 'Your data is already saved to your account; exporting is optional. ' : ''}<b>Export all data</b> makes one <b>iron-log-data</b> file with everything: your log, weekly check-offs, body weight, programs, saved versions, the Experiment list and settings. Keep it as a copy, move to another account or device, or go back to an earlier state.</p>
      <div className="actions">
        {dl && <button type="button" className="btn primary" disabled={!!exporting} onClick={st.downloadData}>Export all data</button>}
        <label className="btn filebtn">Import from file
          <input type="file" id="imp-file" accept={IMPORT_ACCEPT} hidden aria-describedby={importError ? 'imp-err' : 'imp-help'} onChange={e => { st.readImportFile(e.target.files && e.target.files[0]); e.target.value = ''; }} />
        </label>
      </div>
      <p className="note" id="imp-help">Import takes the data file, or a workbook or .csv from an earlier version. An older workbook or a .csv only brings back logged sessions, body weight and main settings. You review before anything changes.</p>
      {importError && <p className="bkmsg err" role="alert" id="imp-err">{importError}</p>}
      <details className="imppaste">
        <summary>Can't pick a file? Paste its contents instead</summary>
        <textarea id="imp-text" rows={4} aria-label="Contents of an iron-log-data file" placeholder="Paste the contents of an iron-log-data file" value={paste} onChange={e => setPaste(e.target.value)} />
        <div className="actions">
          <button type="button" className="btn sm" onClick={() => st.pasteImport(paste)}>Review import</button>
        </div>
      </details>
      {dl && (
        <div className="subblock">
          <h4>Spreadsheet report</h4>
          <p>For reading and charting, not for backup. <b>iron-log.xlsx</b> has a summary per exercise, every session and weekly totals; each week also has its own workbook. The .csv lists logged sessions only.</p>
          <div className="actions">
            <button type="button" className="btn" disabled={!!exporting} onClick={() => st.downloadExcel('all')}>Download Excel</button>
            <button type="button" className="btn" disabled={!!exporting} onClick={() => st.downloadExcel('week')}>Download this week</button>
            <button type="button" className="btn" disabled={!!exporting} onClick={st.exportCsv}>Download CSV</button>
          </div>
        </div>
      )}
    </section>
  );
}

const ERASE = [
  ['logs', 'Logged sessions', 'every weight, set and rep, including ones logged by check-offs'],
  ['weeks', 'Weekly check-offs', 'checked, skipped and moved cards, and phase changes, for every week'],
  ['body', 'Body weight', ''],
  ['programs', 'Edited programs, saved versions and the Experiment list', 'the Board goes back to the original programs'], // synced: a blank one (ADR 021)
  ['settings', 'Settings and 1RMs', 'program mode, rest time, phase percentages, 1RMs, phase defaults, custom exercises and muscle tags'],
];
function ErasePanel() {
  const dl = useAppStore(s => s.dl); const exporting = useAppStore(s => s.exporting); const storeMode = useAppStore(s => s.storeMode);
  const st = useAppStore.getState();
  // Nothing is ticked to start: two taps must never erase everything by default.
  const [sel, setSel] = useState(() => Object.fromEntries(ERASE.map(([k]) => [k, false])));
  const n = Object.values(sel).filter(Boolean).length;
  return (
    <section className="panel erase danger-panel" aria-labelledby="erase-h">
      <h3 id="erase-h">Erase data</h3>
      <p>Deletes what you check below {storeMode === 'db' ? 'from your saved data' : 'from this browser'}, to start the tracker over. It can't be undone here, so use Export all data first.</p>
      <fieldset>
        <legend className="sr">What to erase</legend>
        {ERASE.map(([k, label, hint]) => (
          <label className="inline" key={k}>
            <input type="checkbox" checked={sel[k]} onChange={e => setSel(v => ({ ...v, [k]: e.target.checked }))} />
            <span><b>{label}</b>{hint && <span className="note">: {k === 'programs' && storeMode === 'db' ? 'the Board goes back to a blank program' : hint}</span>}</span>
          </label>
        ))}
      </fieldset>
      <p className="note">Kept: display options, and any file you exported earlier. An export made after erasing holds the erased state.</p>
      <div className="actions">
        {dl && <button type="button" className="btn" disabled={!!exporting} onClick={st.downloadData}>Export all data first</button>}
        <ArmedButton className="btn danger" disabled={!n} label={n ? `Erase ${n} selected` : 'Tick what to erase'} armedLabel={`Tap again to erase ${n}`} onConfirm={() => st.eraseData(sel)} />
      </div>
    </section>
  );
}

// One line per phase, e.g. "35 lb · Strength", so a lift trained in two phases shows which weight is which.
// With a 1RM given, each phase line also shows what that phase's % of the 1RM works out to, to compare with the logged weight.
function PhaseWeights({ list, rm, cfg }: { list: { ph: PhaseKey | null; w: number }[]; rm?: number; cfg?: Cfg }) {
  return list.map(({ ph, w }) => {
    const pct = ph && cfg ? (cfg.pct[ph] ?? PHASES[ph as PhaseKey].pct) : 0;
    return (
      <div key={`${ph}:${w}`} className="phw"><span className="dot" data-p={ph || undefined} /> {w} lb · {ph ? PHASES[ph as PhaseKey].label : 'No phase'}{rm! > 0 && pct > 0 ? ` · ${pct}% of 1RM is ${round(rm! * pct / 100)} lb` : ''}</div>
    );
  });
}

function RmPanel() {
  const cfg = useAppStore(s => s.cfg); const logs = useAppStore(s => s.logs); const programs = useAppStore(s => s.programs);
  const st = useAppStore.getState();
  const all = [...slotsFor(programs.A), ...slotsFor(programs.B)];
  // Program ids too: synced, a card can use an exercise that isn't in the account's library (ADR 024).
  const weighted = [...new Set([...allExIds(cfg), ...all.flatMap(s => s.items.map(i => i.ex))])].filter(id => all.some(s => s.items.some(i => i.ex === id && i.w != null)));
  const withRm = weighted.filter(id => cfg.rm[id] != null).length;
  return (
    <section className="panel wide">
      <h3>1-rep maxes</h3>
      <p>Keep a one-rep max (1RM, the most you can lift once) for reference. It shows next to your logged weights but doesn't set targets: those start from the weight you last logged.</p>
      {/* Folded: one row per weighted exercise is most of the page on a phone, and it is rarely edited. */}
      <details className="fold">
        <summary>{weighted.length ? `Show all ${weighted.length} exercises (${withRm ? `${withRm} with a 1RM` : 'none set yet'})` : 'No weighted exercises in your programs yet'}</summary>
      <div className="tbl">
        <table>
          <thead><tr><th>Exercise</th><th>Program weight</th><th>1RM (lb)</th><th>Best logged</th></tr></thead>
          <tbody>
            {weighted.map(id => {
              const best = bestByPhase(logs[id]);
              return (
                <tr key={id}>
                  <td>{exInfo(cfg, id).n}</td>
                  <td><PhaseWeights list={programWeights(cfg, all, id)} /></td>
                  <td><CommitInput key={`${id}:${cfg.rm[id] ?? ''}`} type="number" id={`rm-${id}`} aria-label={`${exInfo(cfg, id).n} 1RM (lb)`} min="0" step="any" value={cfg.rm[id] ?? ''} placeholder="—" onCommit={(v) => st.setRm(id, v)} /></td>
                  <td>{best.length ? <PhaseWeights list={best} rm={cfg.rm[id]} cfg={cfg} /> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </details>
    </section>
  );
}

// Where each group starts, for the jump row. The page is long on a phone; the row gets to a group in one tap.
const GROUPS = [['training', 'Training'], ['data', 'Data'], ['app', 'App'], ['erase', 'Erase']] as const;
const jump = (id: string) => {
  const h = document.getElementById(`set-${id}-h`);
  if (!h) return;
  h.focus({ preventScroll: true }); // before the scroll: focusing mid-scroll cancels a smooth scroll
  h.scrollIntoView({ behavior: motionOK() ? 'smooth' : 'instant', block: 'start' });
};

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="sgroup" aria-labelledby={`set-${id}-h`}>
      <h2 id={`set-${id}-h`} tabIndex={-1}>{title}</h2>
      <div className="sgrid">{children}</div>
    </section>
  );
}

export default function Settings() {
  const importCount = useAppStore(s => s.importCount);
  const restAlert = useFeature('restNotify');
  return (
    <div className="settings">
      <nav className="sjump" aria-label="Jump to a settings group">
        {GROUPS.map(([id, label]) => <button key={id} type="button" className="chip" onClick={() => jump(id)}>{label}</button>)}
      </nav>
      <Group id="training" title="Training">
        <div className="scol"><ModePanel /></div>
        <div className="scol"><PhasePanel /></div>
        <RmPanel />
      </Group>
      <Group id="data" title="Data">
        <div className="scol">
          <AccountPanel />
          <SyncPanel />
        </div>
        <div className="scol"><DataPanel key={importCount} /></div>
      </Group>
      <Group id="app" title="App">
        <div className="scol">
          <AppearancePanel />
          {restAlert && <RestAlertPanel />}
        </div>
        <div className="scol">
          <DevicePanel />
          <FeedbackPanel />
        </div>
      </Group>
      {/* Last on the page, apart from the everyday data panels: these cannot be undone. */}
      <Group id="erase" title="Erase & delete">
        <div className="scol"><ErasePanel /><DeleteMyData /></div>
      </Group>
    </div>
  );
}
