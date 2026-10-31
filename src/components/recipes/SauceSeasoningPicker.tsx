import { useEffect, useRef, useState } from 'react';
import { filterSauces, sauceTag } from '../../lib/recipeSuggest.js';
import type { Recipe } from '../../types.ts';
import './SauceSeasoningPicker.css';

// The "+ Sauce or seasoning" list under the ingredient rows (brief recipe-sauce-ingredients): your own Sauces and Seasonings, A to Z, filtered as
// you type. Picking one adds a linked row. `sauces` is already the allowed list (src/lib/recipeSuggest.ts `sauceCandidates`).
export default function SauceSeasoningPicker({ sauces, onPick, onClose }: { sauces: Recipe[]; onPick: (sauce: Recipe) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  const shown = filterSauces(sauces, q);
  return (
    <div className="rc-sauces" role="group" aria-label="Sauces and seasonings" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      {sauces.length === 0
        ? <p className="note">You have no sauces or seasonings yet. Add one from Recipes, then link it here.</p>
        : (
          <>
            <input ref={box} type="search" aria-label="Search your sauces and seasonings" placeholder="Search your sauces and seasonings" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
            {shown.length === 0 && <p className="note" role="status">No sauce or seasoning matches.</p>}
            <ul className="rc-saucelist">
              {shown.map(r => (
                <li key={r.id}>
                  <button type="button" className="rc-saucerow" onClick={() => onPick(r)}><b>{r.n}</b><span className="pill custom">{sauceTag(r)}</span></button>
                </li>
              ))}
            </ul>
          </>
        )}
      <div className="rc-pickacts"><button type="button" className="btn" onClick={onClose}>Close</button></div>
    </div>
  );
}
