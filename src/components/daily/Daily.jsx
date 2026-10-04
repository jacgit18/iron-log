import { useAppStore } from '../../store/useAppStore.js';
import Stretches from '../stretches/Stretches.jsx';
import Supplements from '../supplements/Supplements.jsx';
import Medical from './Medical.jsx';

// The things you check off or log every day, under one tab. Add a section by adding a row here.
const DAILY = [['stretches', 'Stretches', Stretches], ['supplements', 'Supplements', Supplements], ['medical', 'Medical', Medical]];

export default function Daily() {
  const view = useAppStore(s => s.dailyView);
  const setDailyView = useAppStore(s => s.setDailyView);
  const View = (DAILY.find(([k]) => k === view) || DAILY[0])[2];
  return (
    <>
      <div className="edtop">
        <div className="seg" role="group" aria-label="Daily section">
          {DAILY.map(([k, l]) => <button type="button" key={k} id={`daily-${k}`} className={view === k ? 'on' : ''} aria-pressed={view === k} onClick={() => setDailyView(k)}>{l}</button>)}
        </div>
      </div>
      <View />
    </>
  );
}
