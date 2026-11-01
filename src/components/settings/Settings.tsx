import AccountPanel from './AccountPanel.js';
import BillingPanel from './BillingPanel.js';
import QaAccountsPanel from './QaAccountsPanel.js';
import DeleteMyData from './DeleteMyData.js';
import FeedbackPanel from './FeedbackPanel.js';
import IssuesPanel from './IssuesPanel.js';
import ExportUpload from './ExportUpload.js';
import ProgramOnComputerRow from './ProgramOnComputerRow.js';
import BackupCopies from './BackupCopies.js';
import { BACKUP_DAYS } from '../../lib/autoBackup.js';
import SyncSection, { SyncVersion } from './SyncPanel.js';
import type { ProgKey } from '../../types.ts';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getSyncApi, useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { PHASES, PH_KEYS } from '../../lib/data.js';
import { MON, fmtShort } from '../../shared/dates.js';
import { programFor, progName, injuryPreventionOn } from '../../lib/logic.js';
import CommitInput from '../CommitInput.jsx';
import ArmedButton from '../ArmedButton.jsx';
import { motionOK } from '../../lib/motion.js';
import { GROUPS, findVisible, jumpToGroup } from '../../lib/settingsGroups.js';
import { closeSettingsScreen, maxesSummary, modeSummary, onCloseSettingsScreen, phasesSummary, type Screen } from '../../lib/settingsScreens.js';
import Icon from '../Icon.js';
import { getAppearance, setAppearance } from '../../lib/appearance.js';
import WaterReminderControls from './WaterReminderControls.js';
import { disablePush, enablePush, pushKindWanted, pushOn, pushSupported, setPushKind } from '../../lib/pushClient.js';
import { notifySupported, restNotifyOn, setRestNotify } from '../../lib/restNotify.js';
import { usePwa, install, keepData, isIOS } from '../../lib/pwa.js';
import { inAndroidApp } from '../../lib/androidApp.js';
import { IMPORT_ACCEPT } from '../../lib/importFile.js';
import { SavedTicks, Tick, useSaving } from './SavedTicks.js';
import MaxesScreen from './MaxesScreen.js';
import { weightedExIds } from '../../lib/oneRepMax.js';
import './Settings.css';


// The panel pattern: heading, one line on what it is for, the controls, then the background in a fold named for the panel.
function More({ about, children }: { about: string; children: ReactNode }) {
  return <details className="more"><summary>More about {about}</summary>{children}</details>;
}

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
        <div className="inline flexwrap">
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

// The colours choice moved to the button beside Help at the top of every screen (ThemeButton.tsx); this keeps the text spacing option.
function TextSpacingPanel() {
  const [roomy, setRoomy] = useState(() => getAppearance().roomy);
  return (
    <section className="panel">
      <h3>Text spacing</h3>
      <label className="inline"><input type="checkbox" checked={roomy} onChange={e => setRoomy(setAppearance({ roomy: e.target.checked }).roomy)} /> Roomier text (more space between lines and paragraphs)</label>
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
    setNote(r === 'denied' ? 'Notifications are blocked for Loadbearer. Allow them in your browser or phone settings, then try again.' : '');
  };
  return (
    <section className="panel">
      <h3>Rest timer alert</h3>
      <label className="inline"><input type="checkbox" checked={on} onChange={e => void toggle(e.target.checked)} /> Show a notification when a rest or hold ends while Loadbearer is in the background</label>
      <p>Saved on this device only.</p>
      {note && <p role="status">{note}</p>}
      <More about="the alert"><p>It only shows while the phone still lets Loadbearer run in the background. If the screen has been locked for a while the alert can be late, and the timer is right when you open the app again.</p></More>
    </section>
  );
}

// Push alerts (ADR 044): the server sends them, so they reach a phone that has locked. Admin-only first.
function PushPanel() {
  const { installed } = usePwa();
  const [on, setOn] = useState(pushOn);
  const [rest, setRest] = useState(() => pushKindWanted('rest'));
  const [nudge, setNudge] = useState(() => pushKindWanted('day-nudge'));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // iPhone only allows push for an app on the Home Screen, and says nothing when it is missing, so say it here.
  if (!pushSupported()) return <section className="panel"><h3>Alerts when Loadbearer is closed</h3><p>{isIOS() && !installed ? 'On iPhone, add Loadbearer to your Home Screen first (Share, then Add to Home Screen) and open it from there. Then this setting appears.' : 'This browser cannot receive push alerts.'}</p></section>;
  const toggle = async (want: boolean) => {
    setBusy(true); setNote('');
    if (want) {
      const r = await enablePush();
      setOn(r === 'on');
      setNote(r === 'denied' ? 'Notifications are blocked for Loadbearer. Allow them in your browser or phone settings, then try again.'
        : r === 'unavailable' ? 'Push is not available right now. Sign in and try again, or check back later.'
        : r === 'failed' ? 'Could not turn push on. Check your connection and try again.' : '');
    } else { await disablePush(); setOn(false); }
    setBusy(false);
  };
  return (
    <section className="panel" aria-labelledby="pushalerts">
      <h3 id="pushalerts">Alerts when Loadbearer is closed</h3>
      <label className="inline"><input type="checkbox" checked={on} disabled={busy} onChange={e => void toggle(e.target.checked)} /> Send alerts to this device, even when the screen is locked</label>
      {on && (
        <>
          <label className="inline"><input type="checkbox" checked={rest} onChange={e => { setRest(e.target.checked); setPushKind('rest', e.target.checked); }} /> When a rest or hold ends</label>
          <label className="inline"><input type="checkbox" checked={nudge} onChange={e => { setNudge(e.target.checked); setPushKind('day-nudge', e.target.checked); }} /> When a day is started but not finished, 30 minutes after your last tick</label>
          <p>The day alert never comes between 9:30 pm and 4 am, and goes away when you finish the day.</p>
          <WaterReminderControls />
        </>
      )}
      <p>Saved on this device only.</p>
      {note && <p role="status">{note}</p>}
      <More about="these alerts"><p>Alerts are sent by the Loadbearer server, so they do not depend on the app running in the background. They contain only a short message. Turning this off, or signing out, removes this device from the server.</p></More>
    </section>
  );
}

function DevicePanel() {
  const { installEvent, installed, persisted } = usePwa();
  const storeMode = useAppStore(s => s.storeMode);
  return (
    <section className="panel">
      <h3>App on this device</h3>
      {installed ? <p>Loadbearer is installed. It opens from your home screen and works without a connection.</p>
        : installEvent ? (
          <>
            <p>Install Loadbearer to open it from your home screen like any other app. It works without a connection.</p>
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

function InjuryPanel() {
  const on = useAppStore(s => injuryPreventionOn(s.cfg)); const st = useAppStore.getState();
  return (
    <section className="panel">
      <h3>Injury prevention</h3>
      <p>Warns when the same muscles land on back-to-back days, and suggests a better day order when you finish a day.</p>
      <label className="inline"><input type="checkbox" role="switch" aria-label="Injury prevention" checked={on} onChange={e => st.setInjuryPrevention(e.target.checked)} /> {on ? 'On' : 'Off'}</label>
      <More about="injury prevention">
        <p>An exercise you do on three or more days a week at fewer than four sets is left out, because it is light.</p>
        <p>When this is off, moving a card or a day never shows the Heads-up, and finishing a day never shows the Back-to-back suggestion. Undo for ticks, skips and removals still works, and so does moving cards yourself. A new account starts with it off.</p>
      </More>
    </section>
  );
}

function PhasePanel() {
  const cfg = useAppStore(s => s.cfg); const st = useAppStore.getState(); const saving = useSaving();
  return (
    <section className="panel">
      <h3>Phases</h3>
      <p>Default sets × reps for each phase, and the % of 1RM to compare with.</p>
      {/* One row per phase, each field labelled in place: a table's three columns wrapped the % under its box on a phone. */}
      <div className="phrows">
        {PH_KEYS.map(k => {
          const pct = cfg.pct[k] ?? PHASES[k].pct; const rx = cfg.rxOverride[k] || PHASES[k].rx;
          return (
            <div className="phrow" key={k}>
              <span className="phname"><span className="dot" data-p={k} /> {PHASES[k].label}</span>
              {PHASES[k].pct === 0
                ? <div className="phfield"><span>% of 1RM</span><span className="pctin">—</span></div>
                : <label className="phfield"><span>% of 1RM <Tick id={`pct-${k}`} /></span><span className="pctin"><CommitInput key={`${k}:${pct}`} type="number" id={`pct-${k}`} aria-label={`${PHASES[k].label} % of 1RM`} min="0" max="110" step="1" value={pct} onCommit={saving(`pct-${k}`, v => st.setPct(k, v))} /> %</span></label>}
              <label className="phfield"><span>Sets × reps <Tick id={`rx-${k}`} /></span><CommitInput key={`${k}:${rx}`} className="wide" id={`rx-${k}`} aria-label={`${PHASES[k].label} sets × reps`} value={rx} onCommit={saving(`rx-${k}`, v => st.setRxOverride(k, v))} /></label>
            </div>
          );
        })}
      </div>
      <label className="inline" htmlFor="rest-s">Rest between sets{' '}
        <CommitInput key={`rest:${cfg.rest ?? 90}`} type="number" id="rest-s" min="0" max="600" step="any" value={cfg.rest ?? 90} className="w-80" onCommit={saving('rest', st.setRest)} /> seconds <Tick id="rest" />
      </label>
      <More about="phases">
        <p>Each phase has default sets × reps. The target weight starts from the weight you last logged for that exercise in that phase, otherwise the program's weight. The % of 1RM is only for comparing with your 1RM below; it doesn't set targets.</p>
        <p>The percentages are placeholders until you set your own. Isometric holds are usually judged by time and effort more than by % of a lifting max.</p>
      </More>
    </section>
  );
}

function DataPanel() {
  const dl = useAppStore(s => s.dl); const exporting = useAppStore(s => s.exporting); const st = useAppStore.getState();
  const storeMode = useAppStore(s => s.storeMode);
  const weekStart = useAppStore(s => s.weekStart); const shownWeek = fmtShort(weekStart); // the week the Board shows, which may not be this one
  const importError = useAppStore(s => s.importError);
  const [paste, setPaste] = useState('');
  const syncing = useAppStore(s => s.sync !== null) && !!getSyncApi(); // sync is on: its status is the top of this panel
  return (
    <section className="panel" aria-labelledby="data-h">
      <h3 id="data-h">{syncing ? 'Sync, backups & data' : 'Backups & data'}</h3>
      <SyncSection />
      {/* Nothing while loading: a signed-in person must not read "this browser only" before the data source is known. */}
      {storeMode === 'db' && <p>Your data is already saved to your account, and Loadbearer keeps backups for you.</p>}
      {storeMode === 'local' && <p>Your data is in this browser only. Loadbearer keeps a backup for you each day; save a file now and then for a copy outside the browser.</p>}
      <BackupCopies />
      {importError && <p className="bkmsg err" role="alert" id="imp-err">{importError}</p>}
      <details className="manualcopy">
        <summary>Save or load a file yourself</summary>
      <div className="actions">
        {dl && <button type="button" className="btn primary" disabled={!!exporting} onClick={st.downloadData}>Export all data</button>}
        <label className="btn filebtn">Import from file
          <input type="file" id="imp-file" accept={IMPORT_ACCEPT} hidden aria-describedby={importError ? 'imp-err' : 'imp-help'} onChange={e => { st.readImportFile(e.target.files && e.target.files[0]); e.target.value = ''; }} />
        </label>
      </div>
      <p className="note" id="imp-help">Import can add to your data or replace it, and you choose after the review. It takes the data file, or a workbook or .csv from an earlier version (an older workbook or a .csv only brings back logged sessions, body weight and main settings). You review before anything changes.</p>
      <details className="imppaste">
        <summary>Can't pick a file? Paste its contents instead</summary>
        <textarea id="imp-text" rows={4} aria-label="Contents of an iron-log-data file" placeholder="Paste the contents of an iron-log-data file" value={paste} onChange={e => setPaste(e.target.value)} />
        <div className="actions">
          <button type="button" className="btn sm" onClick={() => st.pasteImport(paste)}>Review import</button>
        </div>
      </details>
      <More about="export and import">
        <p><b>Export all data</b> makes one <b>iron-log-data</b> file with everything: your log, weekly check-offs, body weight, programs, saved versions, the Experiment list and settings. Keep it as a copy, move to another account or device, or go back to an earlier state.</p>
      </More>
      <ExportUpload />
      </details>
      {dl && (
        <div className="subblock">
          <h4>Spreadsheet report</h4>
          <p>For reading and charting, not a backup.</p>
          {/* Short labels under one "Download" label, so each fits one line on a phone; the full action is the accessible name. */}
          <div className="actions dl" role="group" aria-labelledby="dl-label">
            <span id="dl-label" className="dllabel">Download</span>
            <button type="button" className="btn" disabled={!!exporting} aria-label="Download Excel, every week" onClick={() => st.downloadExcel('all')}>Excel</button>
            <button type="button" className="btn" disabled={!!exporting} aria-label={`Download the week of ${shownWeek} as Excel`} onClick={() => st.downloadExcel('week')}>Week of {shownWeek}</button>
            <button type="button" className="btn" disabled={!!exporting} aria-label="Download CSV" onClick={st.exportCsv}>CSV</button>
          </div>
          <More about="the reports"><p><b>iron-log.xlsx</b> has a summary per exercise, every session and weekly totals; each week also has its own workbook. The .csv lists logged sessions only.</p></More>
        </div>
      )}
      <SyncVersion />
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
      <p>Deletes what you check below {storeMode === 'db' ? 'from your saved data' : 'from this browser'}, to start the tracker over. It can't be undone here, so use Export all data first. The automatic backups keep a copy for up to {BACKUP_DAYS} days.</p>
      <fieldset>
        <legend className="sr">What to erase</legend>
        {ERASE.map(([k, label, hint]) => (
          <label className="inline" key={k}>
            <input type="checkbox" checked={sel[k]} onChange={e => setSel(v => ({ ...v, [k]: e.target.checked }))} />
            <span><b>{label}</b>{hint && <span className="note">: {k === 'programs' && storeMode === 'db' ? 'the Board goes back to a blank program' : hint}</span>}</span>
          </label>
        ))}
      </fieldset>
      {/* In view before the button: someone who erases first and exports after would lose the data. */}
      <p className="note">Kept: display options, and any file you exported earlier. An export made after erasing holds the erased state.</p>
      <div className="actions">
        {dl && <button type="button" className="btn" disabled={!!exporting} onClick={st.downloadData}>Export all data first</button>}
        <ArmedButton className="btn danger" disabled={!n} label={n ? `Erase ${n} selected` : 'Tick what to erase'} armedLabel={`Tap again to erase ${n}`} onConfirm={() => st.eraseData(sel)} />
      </div>
    </section>
  );
}

// Where each group starts, for the jump row. The page is long on a phone; the row gets to a group in one tap.
const jump = (id: string) => { closeSettingsScreen(); void jumpToGroup(id, { find: findVisible, raf: requestAnimationFrame, smooth: motionOK() }); };

// The group being read: the last whose heading has scrolled up under the sticky jump row (the last one at the bottom of the page).
function useCurrentGroup() {
  const [cur, setCur] = useState<string>(GROUPS[0][0]);
  useEffect(() => {
    let frame = 0;
    const look = () => {
      frame = 0;
      const rail = window.matchMedia('(min-width:901px)').matches; // a rail down the left side, not a bar across the top
      const bar = rail ? 0 : document.querySelector('.sjump')?.getBoundingClientRect().bottom ?? 0;
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      let next: string = GROUPS[0][0];
      let best = -Infinity; // side by side columns share a top: the earlier group wins a tie, unless a jump just focused the later one's heading
      for (const [id] of GROUPS) { const h = document.getElementById(`set-${id}-h`); const t = h?.getBoundingClientRect().top; if (h && t !== undefined && t <= bar + 24 && (t > best + 1 || (t >= best - 1 && document.activeElement === h))) { best = Math.max(best, t); next = id; } }
      setCur(atEnd ? GROUPS[GROUPS.length - 1][0] : next);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(look); };
    look();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    // The row's real height (it wraps under large text) is the page's scroll padding, so focus and jumps land below it.
    const root = document.documentElement; const nav = document.querySelector('.sjump');
    const ro = nav && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => root.style.setProperty('--sjump-h', `${Math.ceil(nav.getBoundingClientRect().height)}px`)) : null;
    if (nav && ro) ro.observe(nav);
    return () => {
      window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (frame) cancelAnimationFrame(frame);
      ro?.disconnect(); root.style.removeProperty('--sjump-h');
    };
  }, []);
  return cur;
}

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="sgroup" data-group={id} aria-labelledby={`set-${id}-h`}>
      <h2 id={`set-${id}-h`} tabIndex={-1}>{title}</h2>
      <div className="sgrid">{children}</div>
    </section>
  );
}

// Training: summary rows that each open their own screen (Program mode, Phases, 1-rep maxes), and the Injury prevention switch.
function TrainingRows({ open }: { open: (s: Screen) => void }) {
  const cfg = useAppStore(s => s.cfg); const programs = useAppStore(s => s.programs);
  const weighted = weightedExIds(cfg, programs);
  const rows: [Screen, string, string][] = [
    ['mode', 'Program mode', modeSummary(cfg.mode, progName(cfg, 'A'))],
    ['phases', 'Phases', phasesSummary(cfg)],
    ['maxes', '1-rep maxes', maxesSummary(weighted.length, weighted.filter(id => cfg.rm[id] != null).length)],
  ];
  return (
    <section className="panel sdrills" aria-label="Training settings">
      {rows.map(([k, title, sum]) => (
        <button key={k} type="button" className="sdrill" id={`drill-${k}`} onClick={() => open(k)}>
          <span className="sdt"><b>{title}</b><span>{sum}</span></span>
          <Icon name="chevron-right" />
        </button>
      ))}
    </section>
  );
}

// One of those screens: a back link, then the panel as it was. Opening it pushes a history entry, so the browser's Back button closes it.
function SettingsScreen({ screen, sub, openSub, onBack }: { screen: Screen; sub: string | null; openSub: (id: string) => void; onBack: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
    const h = ref.current?.querySelector('h3'); h?.setAttribute('tabindex', '-1'); (h as HTMLElement | null)?.focus({ preventScroll: true });
  }, [sub]); // a 1-rep max row opens a screen inside the screen: the new heading takes focus
  return (
    <div className="sscreen" ref={ref}>
      <button type="button" className="sback" onClick={onBack}><Icon name="chevron-left" /> {sub ? '1-rep maxes' : 'Training'}</button>
      {screen === 'mode' && <ModePanel />}
      {screen === 'phases' && <PhasePanel />}
      {screen === 'maxes' && <MaxesScreen sub={sub} open={openSub} />}
    </div>
  );
}

export default function Settings() {
  const importCount = useAppStore(s => s.importCount);
  const cur = useCurrentGroup();
  const [screen, setScreen] = useState<Screen | null>(null);
  const [sub, setSub] = useState<string | null>(null); // an exercise's screen inside 1-rep maxes
  const was = useRef<{ screen: Screen; y: number } | null>(null); // where the screen was opened from, to go back to
  const open = (s: Screen) => { was.current = { screen: s, y: window.scrollY }; history.pushState({ nav: history.state?.nav, settingsScreen: s }, ''); setScreen(s); };
  // An exercise's screen inside 1-rep maxes replaces the entry instead of pushing another: one entry per Settings screen, so Back (or choosing another tab) leaves nothing behind.
  const openSub = (id: string) => { history.replaceState({ nav: history.state?.nav, settingsScreen: 'maxes', sub: id }, ''); setSub(id); };
  const back = () => {
    if (sub) { history.replaceState({ nav: history.state?.nav, settingsScreen: 'maxes' }, ''); setSub(null); return; } // from an exercise to the list
    if (history.state?.settingsScreen) history.back(); else setScreen(null);
    setSub(null);
  };
  useEffect(() => {
    // Only ever closes or switches a screen of ours: a popstate with no `settingsScreen` in its state leaves a closed Settings as it is.
    const onPop = (e: PopStateEvent) => { setScreen(now => (e.state?.settingsScreen as Screen | undefined) ?? (now ? null : now)); setSub((e.state?.sub as string | undefined) ?? null); };
    window.addEventListener('popstate', onPop);
    // Sent to a group by the account menu or the jump row: close the screen now, and drop its history entry without leaving the page.
    const off = onCloseSettingsScreen(() => { setScreen(null); setSub(null); was.current = null; if (history.state?.settingsScreen) history.replaceState({ nav: history.state.nav }, ''); });
    return () => {
      window.removeEventListener('popstate', onPop); off();
      if (history.state?.settingsScreen) history.back(); // another tab was chosen with a screen open: take its history entry back, so Back is not a dead press
    };
  }, []);
  useEffect(() => {
    if (screen !== null || !was.current) return; // closed by Back: land where the row is, focus on it
    const { screen: k, y } = was.current; was.current = null;
    window.scrollTo(0, y); document.getElementById(`drill-${k}`)?.focus({ preventScroll: true });
  }, [screen]);
  return (
    <SavedTicks><div className="settings">
      <div className="smain" hidden={screen !== null}>
        {/* A bar across the top on a phone, a rail down the left on a wide screen; sticky either way, so a group is one tap away. The group being read is marked. */}
        <nav className="sjump" aria-label="Jump to a settings group">
          {GROUPS.map(([id, label]) => <button key={id} type="button" className="chip" aria-current={cur === id ? 'true' : undefined} onClick={() => jump(id)}>{label}</button>)}
        </nav>
        <div className="sgroups">
          <Group id="training" title="Training">
            <div className="scol"><TrainingRows open={open} /><InjuryPanel /></div>
          </Group>
          <Group id="data" title="Data">
            <div className="scol">
              <AccountPanel />
              {!inAndroidApp() && <BillingPanel />}
              <QaAccountsPanel />
            </div>
            <div className="scol"><DataPanel key={importCount} /></div>
          </Group>
          <Group id="app" title="App">
            <div className="scol">
              <TextSpacingPanel />
              <RestAlertPanel />
              <PushPanel />
            </div>
            <div className="scol">
              <ProgramOnComputerRow />
              <DevicePanel />
              <FeedbackPanel />
              <IssuesPanel />
            </div>
          </Group>
          {/* Last on the page, apart from the everyday data panels: these cannot be undone. */}
          <Group id="erase" title="Erase & delete">
            <div className="scol"><ErasePanel /></div>
            <div className="scol"><DeleteMyData /></div>
          </Group>
        </div>
      </div>
      {screen && <SettingsScreen screen={screen} sub={sub} openSub={openSub} onBack={back} />}
    </div></SavedTicks>
  );
}
