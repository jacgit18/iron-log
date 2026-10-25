import { useState } from 'react';
import { pushKindWanted, setPushKind } from '../../lib/pushClient.js';
import { goalMetNow, setWaterPrefs, trackWater, validTime, waterPrefs } from '../../lib/waterReminder.js';
import { useAppStore } from '../../store/useAppStore.js';

// The drink-water reminder's box and its three settings, inside the push panel (so it only shows while push is on). Device-local, like the other boxes.
export default function WaterReminderControls() {
  const [want, setWant] = useState(() => pushKindWanted('water'));
  const [prefs, setPrefs] = useState(waterPrefs);
  const met = () => { const s = useAppStore.getState(); return goalMetNow(s.supp, s.body); };
  const tick = (on: boolean) => { setWant(on); setPushKind('water', on); if (on) trackWater('change', met()); };
  const save = (patch: Partial<typeof prefs>) => { setPrefs(p => ({ ...p, ...patch })); setWaterPrefs(patch, met()); };
  return (
    <>
      <label className="inline"><input type="checkbox" id="water-reminder" checked={want} onChange={e => tick(e.target.checked)} /> Remind me to drink water</label>
      {want && (
        <>
          <label className="field">Every
            <select id="water-every" value={prefs.everyH} onChange={e => save({ everyH: Number(e.target.value) })}>
              {[1, 2, 3].map(h => <option key={h} value={h}>{h === 1 ? '1 hour' : `${h} hours`}</option>)}
            </select>
          </label>
          <label className="field">From
            <input id="water-from" type="time" value={prefs.from} onChange={e => validTime(e.target.value) && save({ from: e.target.value })} />
          </label>
          <label className="field">Until
            <input id="water-until" type="time" value={prefs.until} onChange={e => validTime(e.target.value) && save({ until: e.target.value })} />
          </label>
          {prefs.until <= prefs.from && <p role="status">Until has to be later than From, or no reminders will come.</p>}
          <p>Reminders come between these times, and stop for the day once you reach your water goal. After you log a drink the next one is an interval from then. Open Loadbearer in the morning to start the day's reminders.</p>
        </>
      )}
    </>
  );
}
