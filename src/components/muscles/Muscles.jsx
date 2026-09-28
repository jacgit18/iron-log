import { useAppStore } from '../../store/useAppStore.js';
import { exInfo } from '../../lib/data.js';
import { progName } from '../../lib/logic.js';
import { MUSCLES, M_KEYS, SIL, FRONT, BACK, level, fmtSets, muscleVolume } from '../../lib/muscles.js';

const MIRROR = 'matrix(-1 0 0 1 200 0)';

function Figure({ shapes, label, vol, sel, onPick }) {
  return (
    <figure className="fig">
      <svg viewBox="30 0 140 420" role="group" aria-label={`${label} view`}>
        <circle className="sil" cx="100" cy="26" r="17" />
        <path className="sil" d={SIL} />
        <path className="sil" d={SIL} transform={MIRROR} />
        {shapes.flatMap(([m, d]) => {
          const cls = `mu l${level(vol[m].sets)}${sel === m ? ' sel' : ''}`;
          const title = `${MUSCLES[m].n}: ${vol[m].sets ? fmtSets(vol[m].sets) + ' sets/week' : 'not trained'}`;
          return [false, true].map(mir => (
            <path key={`${m}-${mir}`} className={cls} d={d} transform={mir ? MIRROR : undefined} onClick={() => onPick(m)}>
              <title>{title}</title>
            </path>
          ));
        })}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function MuscleDetail({ m, v, prog, withSec }) {
  const cfg = useAppStore(s => s.cfg);
  const { selectMuscle, openModal } = useAppStore.getState();
  const grouped = {};
  v.ex.forEach(e => { const k = e.ex + '|' + e.role; (grouped[k] = grouped[k] || { ...e, days: [] }).days.push(e.day); });
  const rows = Object.values(grouped).sort((a, b) => (a.role === b.role ? a.days[0] - b.days[0] : a.role === 'p' ? -1 : 1));
  return (
    <section className="panel">
      <div className="inline" style={{ justifyContent: 'space-between' }}>
        <h2>{MUSCLES[m].n}</h2>
        <button type="button" className="btn sm ghost" onClick={() => selectMuscle(null)}>Close</button>
      </div>
      <p>
        {v.sets
          ? <>About <b>{fmtSets(v.sets)}</b> sets a week in {progName(cfg, prog)}.{withSec ? ' Secondary work counts as half a set.' : ' Primary work only.'}</>
          : `Nothing in ${progName(cfg, prog)} trains this.`}
      </p>
      {rows.length > 0 && (
        <div className="mlist">
          {rows.map(r => (
            <div className="mrow" key={`${r.ex}|${r.role}`}>
              <span className={`role ${r.role}`}>{r.role === 'p' ? 'Primary' : 'Secondary'}</span>
              <span className="mname">{exInfo(cfg, r.ex).n}{r.either && <> <small>(either/or)</small></>}</span>
              <span className="mdays">{[...new Set(r.days)].sort().map(d => 'D' + d).join(' ')}</span>
              <button type="button" className="btn sm ghost" onClick={() => openModal({ type: 'tags', exId: r.ex })}>Edit</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Ranking({ vol, onPick }) {
  const ranked = M_KEYS.map(k => ({ k, s: vol[k].sets })).sort((a, b) => b.s - a.s);
  const top = Math.max(...ranked.map(x => x.s));
  const none = ranked.filter(r => !r.s);
  return (
    <section className="panel">
      <h2>Weekly sets by muscle</h2>
      <p>Tap a muscle on the body or in this list to see the exercises that train it.</p>
      <div className="mbars">
        {ranked.filter(r => r.s).map(r => (
          <button type="button" className="mbar" key={r.k} onClick={() => onPick(r.k)}>
            <span>{MUSCLES[r.k].n}</span>
            <span className="track"><i className={`l${level(r.s)}`} style={{ width: `${Math.min(100, r.s / top * 100)}%` }} /></span>
            <b>{fmtSets(r.s)}</b>
          </button>
        ))}
      </div>
      {none.length > 0 && (
        <p><b>Not trained:</b>{' '}
          {none.map((r, i) => (
            <span key={r.k}>{i > 0 && ', '}<button type="button" className="linkbtn" onClick={() => onPick(r.k)}>{MUSCLES[r.k].n}</button></span>
          ))}
        </p>
      )}
    </section>
  );
}

export default function Muscles() {
  const cfg = useAppStore(s => s.cfg); const week = useAppStore(s => s.week);
  const programs = useAppStore(s => s.programs);
  const bodyView = useAppStore(s => s.bodyView); const sel = useAppStore(s => s.bodySel); const withSec = useAppStore(s => s.bodySec);
  const cur = useAppStore(s => s.activeProgKey());
  const { setBodyView, selectMuscle, setBodySec, openModal } = useAppStore.getState();
  const view = bodyView || cur;
  const { vol, untagged } = muscleVolume(cfg, week, programs[view] || programs.A, view === cur, withSec);

  return (
    <>
      <div className="edtop">
        <div className="seg" role="group" aria-label="Program">
          {['A', 'B'].map(k => (
            <button type="button" key={k} className={k === view ? 'on' : ''} aria-pressed={k === view} onClick={() => setBodyView(k)}>
              {progName(cfg, k)}{k === cur ? ' · on board' : ''}
            </button>
          ))}
        </div>
      </div>
      <div className="bodywrap">
        <div className="figs">
          <Figure shapes={FRONT} label="Front" vol={vol} sel={sel} onPick={selectMuscle} />
          <Figure shapes={BACK} label="Back" vol={vol} sel={sel} onPick={selectMuscle} />
        </div>
        <div className="bodyside">
          <div className="legend">
            <span><i className="sw l0" />Not trained</span><span><i className="sw l1" />1–4 sets</span><span><i className="sw l2" />5–9</span>
            <span><i className="sw l3" />10–20</span><span><i className="sw l4" />Over 20</span><span className="note">per week</span>
          </div>
          <label className="inline"><input type="checkbox" id="body-sec" checked={withSec} onChange={e => setBodySec(e.target.checked)} /> Count secondary work (as half a set)</label>
          {sel ? <MuscleDetail m={sel} v={vol[sel]} prog={view} withSec={withSec} /> : <Ranking vol={vol} onPick={selectMuscle} />}
          {untagged.length > 0 && (
            <section className="panel">
              <h2>Not mapped yet</h2>
              <p>These exercises have no muscles tagged, so they don't show on the body.</p>
              <div className="mlist">
                {untagged.map(id => (
                  <div className="mrow" key={id}>
                    <span className="mname">{exInfo(cfg, id).n}</span>
                    <button type="button" className="btn sm" onClick={() => openModal({ type: 'tags', exId: id })}>Tag muscles</button>
                  </div>
                ))}
              </div>
            </section>
          )}
          <p className="note">Muscle tags are a best guess for each exercise. Tap Edit on any exercise to correct them.</p>
        </div>
      </div>
    </>
  );
}
