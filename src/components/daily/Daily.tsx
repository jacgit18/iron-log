import { useEffect, type ComponentType } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useFeature } from '../../features.js';
import Supplements from '../supplements/Supplements.jsx';
import Grocery from '../grocery/Grocery.js';
import Medical from './Medical.js';
import Recipes from '../recipes/Recipes.js';
import { dailyFix, dailySection } from '../../lib/route.js';
import { navigate, useRoutePath } from '../useRoute.js';
import { pickView } from './pickView.js';

// The things you check off or log every day, under one tab. Add a section by adding a row here.
// The Supplements section is called Nutrition ('supplements' stays its key, so a saved view and the button id keep working). Medical is admin-only for now; Recipes is for everyone (ADR 084).
const DAILY: [string, string, ComponentType][] = [['grocery', 'Groceries', Grocery], ['supplements', 'Nutrition', Supplements], ['medical', 'Medical', Medical], ['recipes', 'Recipes', Recipes]];

export default function Daily() {
  const view = useAppStore(s => s.dailyView);
  const setDailyView = useAppStore(s => s.setDailyView);
  const shown: Record<string, boolean> = { medical: useFeature('medical') };
  const sections = DAILY.filter(([k]) => shown[k] !== false);
  const path = useRoutePath();
  const keys = sections.map(([k]) => k);
  // The address wins when it names a section that is offered (#/daily/recipes). Nutrition stays the one that opens first; the buttons follow what is shown, not the raw saved view.
  const cur = pickView(keys, dailySection(path, keys) ?? view);
  const View = sections.find(([k]) => k === cur)![2];
  // The address follows the section shown, so it can be copied or reloaded; a deeper page (#/daily/recipes/mine) is left as it is.
  useEffect(() => { const fix = dailyFix(path, cur); if (fix) navigate(fix, 'replace'); }, [path, cur]);
  return (
    <>
      <div className="edtop">
        <div className="seg" role="group" aria-label="Daily section">
          {sections.map(([k, l]) => <button type="button" key={k} id={`daily-${k}`} className={cur === k ? 'on' : ''} aria-pressed={cur === k} onClick={() => { setDailyView(k); navigate(dailyFix('daily', k) ?? 'daily', 'replace'); }}>{l}</button>)}
        </div>
      </div>
      <View />
    </>
  );
}
