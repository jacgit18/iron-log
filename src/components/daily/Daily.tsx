import type { ComponentType } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import Supplements from '../supplements/Supplements.jsx';
import Grocery from '../grocery/Grocery.js';
import Medical from './Medical.jsx';
import { useFeature } from '../../features.js';

// The things you check off or log every day, under one tab. Add a section by adding a row here.
const DAILY: [string, string, ComponentType][] = [['grocery', 'Groceries', Grocery], ['supplements', 'Supplements', Supplements], ['medical', 'Medical', Medical]];

export default function Daily() {
  const view = useAppStore(s => s.dailyView);
  const setDailyView = useAppStore(s => s.setDailyView);
  const grocery = useFeature('grocery');
  const sections = DAILY.filter(([k]) => k !== 'grocery' || grocery);
  const View = (sections.find(([k]) => k === view) || sections.find(([k]) => k === 'supplements') || sections[0])[2]; // Supplements stays the one that opens first
  return (
    <>
      <div className="edtop">
        <div className="seg" role="group" aria-label="Daily section">
          {sections.map(([k, l]) => <button type="button" key={k} id={`daily-${k}`} className={view === k ? 'on' : ''} aria-pressed={view === k} onClick={() => setDailyView(k)}>{l}</button>)}
        </div>
      </div>
      <View />
    </>
  );
}
