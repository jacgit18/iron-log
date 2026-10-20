import type { ComponentType } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useFeature } from '../../features.js';
import Supplements from '../supplements/Supplements.jsx';
import Grocery from '../grocery/Grocery.js';
import Medical from './Medical.js';
import Recipes from '../recipes/Recipes.js';
import { pickView } from './pickView.js';

// The things you check off or log every day, under one tab. Add a section by adding a row here.
// The Supplements section is called Nutrition ('supplements' stays its key, so a saved view and the button id keep working). Medical and Recipes are admin-only for now.
const DAILY: [string, string, ComponentType][] = [['grocery', 'Groceries', Grocery], ['supplements', 'Nutrition', Supplements], ['medical', 'Medical', Medical], ['recipes', 'Recipes', Recipes]];

export default function Daily() {
  const view = useAppStore(s => s.dailyView);
  const setDailyView = useAppStore(s => s.setDailyView);
  const shown: Record<string, boolean> = { medical: useFeature('medical'), recipes: useFeature('recipes') };
  const sections = DAILY.filter(([k]) => shown[k] !== false);
  const cur = pickView(sections.map(([k]) => k), view); // Nutrition stays the one that opens first; the buttons follow what is shown, not the raw saved view
  const View = sections.find(([k]) => k === cur)![2];
  return (
    <>
      <div className="edtop">
        <div className="seg" role="group" aria-label="Daily section">
          {sections.map(([k, l]) => <button type="button" key={k} id={`daily-${k}`} className={cur === k ? 'on' : ''} aria-pressed={cur === k} onClick={() => setDailyView(k)}>{l}</button>)}
        </div>
      </div>
      <View />
    </>
  );
}
