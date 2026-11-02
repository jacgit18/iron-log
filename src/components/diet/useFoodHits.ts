import { useEffect, useRef, useState } from 'react';
import { FOODS_FAILURE_TEXT, searchFoods } from '../../lib/foodsClient.js';
import { cleanQuery, type FoodHit } from '../../shared/foods.js';

const PAUSE_MS = 300;

/** The food search as a hook (brief diet-food-lookup): the foods for what is typed after a short pause, or the plain words for why there are none. One request at a time: a newer search cancels the older, and a late answer for old words is dropped. Asks nothing while `on` is false. */
export function useFoodHits(text: string, on = true): { hits: FoodHit[]; note: string } {
  const [hits, setHits] = useState<FoodHit[]>([]);
  const [note, setNote] = useState('');
  const run = useRef(0);
  useEffect(() => {
    const q = on ? cleanQuery(text) : null;
    const id = ++run.current;
    if (!q) { setHits([]); setNote(''); return; }
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      searchFoods(q, ctl.signal).then(r => {
        if (id !== run.current) return;
        if (!r.ok) { setHits([]); setNote(FOODS_FAILURE_TEXT[r.reason]); return; }
        setHits(r.hits);
        setNote(r.hits.length === 0 ? 'No foods found. Type the numbers instead.' : '');
      });
    }, PAUSE_MS);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [text, on]);
  return { hits, note };
}
