import { useState } from 'react';
import { editProfile, yearFeedback } from '../../lib/profileEdit.js';
import type { Profile } from '../../shared/profile.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import './ProfileRow.css';

// Settings, App group: the optional birth year and sex that pick the recommended amounts in the Totals sheet (brief recommendations-by-age-sex). Stored in `cfg.profile`, part of the settings document: it syncs with the rest of the account's settings and goes with delete-my-data and the export, and nothing else reads it.
export default function ProfileRow() {
  const profile = useAppStore(s => s.cfg.profile);
  const thisYear = useToday(s => s.today).getFullYear();
  const [year, setYear] = useState(profile?.birthYear !== undefined ? String(profile.birthYear) : '');
  const save = (p: Profile | undefined) => { useAppStore.getState().mutateCfg(c => { if (p) c.profile = p; else delete c.profile; }); };
  const fb = yearFeedback(year, thisYear);
  const sex = profile?.sex ?? 'none';
  return (
    <section className="panel" aria-labelledby="pr-h">
      <h3 id="pr-h">Recommended amounts</h3>
      <p>Used only to pick the recommended amounts in the vitamin and mineral totals, which are published for women and men. For this account only; nothing else reads it. It does not cover pregnancy or breastfeeding.</p>
      <div className="pr-fields">
        <label className="pr-year" htmlFor="pr-year">Birth year
          <input id="pr-year" type="text" inputMode="numeric" maxLength={4} autoComplete="off" value={year} aria-describedby="pr-year-msg" aria-invalid={fb.error ? true : undefined}
            onChange={e => { setYear(e.target.value); save(editProfile(profile, { year: e.target.value }, thisYear)); }} />
        </label>
        <p className="note" id="pr-year-msg" role={fb.error ? 'alert' : undefined}>{fb.error || fb.note}</p>
        <fieldset className="pr-sex">
          <legend>Sex</legend>
          {([['female', 'Female'], ['male', 'Male'], ['none', 'Prefer not to say']] as const).map(([v, label]) => (
            <label key={v}><input type="radio" name="pr-sex" value={v} checked={sex === v} onChange={() => save(editProfile(profile, { sex: v }, thisYear))} /> {label}</label>
          ))}
        </fieldset>
        <div className="actions"><button type="button" className="btn sm" id="pr-clear" disabled={!profile && year === ''} onClick={() => { setYear(''); save(undefined); }}>Clear</button></div>
      </div>
    </section>
  );
}
