import { useEffect, useRef } from 'react';
import type { CatalogItem, Cfg, EquipmentId } from '../types.ts';
import { exInfo, EQUIPMENT } from '../lib/data.js';
import { exerciseOptions } from '../lib/exerciseOptions.js';
import { findExIdIn, muscleList } from '../lib/exerciseLibrary.js';
import { useExIdsInUse } from '../hooks/useExIdsInUse.js';
import { pickerKey } from '../lib/picker.js';
import EquipmentField from './EquipmentField.jsx';
import ItemPicker from './ItemPicker.jsx';

// Type an exercise and pick it (ADR 036): your library first, then the catalog when syncing, then a new one. A name that isn't in your
// library yet is added to it when the sheet is saved; so is a catalog exercise picked here (`cat`), so Cancel adds nothing.
type Props = {
  cfg: Cfg; id: string; name: string; url?: string; eq?: string;
  onName: (v: string) => void; onUrl?: (v: string) => void; onEq?: (v: string) => void;
  /** The catalog exercise picked here, held until the sheet saves; null once the name no longer matches it. */
  cat?: CatalogItem | null; onCat?: (c: CatalogItem | null) => void;
};

const catalogMeta = (c: CatalogItem) => [c.data.eq ? EQUIPMENT[c.data.eq] : '', c.data.muscles?.p?.length ? muscleList(c.data.muscles.p) : ''].filter(Boolean).join(' · ');

export default function ExerciseField({ cfg, id, name, url, eq = '', onName, onUrl, onEq, cat = null, onCat }: Props) {
  // Your library, plus exercises your programs, versions, experiments or logs still use that are not in it (exerciseOptions).
  const inUse = useExIdsInUse(cfg);
  const mine = exerciseOptions(cfg, inUse);
  const held = cat && pickerKey(cat.name) === pickerKey(name) ? cat : null;
  const known = name.trim() !== '' && !held ? findExIdIn(cfg, name, inUse) : null; // finds an in-use built-in too, as listed above
  const isNew = name.trim() !== '' && !known && !held;
  // Picking an existing exercise shows its saved video link and equipment, so what you save is that exercise's values (edited or
  // not); a catalog pick shows the catalog's equipment. Values shown that way are cleared when the name stops matching; ones typed
  // for a new exercise are kept.
  const filled = useRef<string | null>(null);
  const filledEq = useRef<string | null>(null);
  useEffect(() => {
    if (onUrl) {
      if (known) { const u = exInfo(cfg, known).url || ''; filled.current = u; onUrl(u); }
      else if (filled.current != null && url === filled.current) { filled.current = null; onUrl(''); }
    }
    if (onEq) {
      if (known) { const e = exInfo(cfg, known).eq || ''; filledEq.current = e; onEq(e); }
      else if (held) { const e = held.data.eq && EQUIPMENT[held.data.eq] ? held.data.eq : ''; filledEq.current = e; onEq(e); }
      else if (filledEq.current != null && eq === filledEq.current) { filledEq.current = null; onEq(''); }
    }
  }, [known, held?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const onText = (v: string) => { onName(v); if (cat && pickerKey(v) !== pickerKey(cat.name)) onCat?.(null); };
  return (
    <>
      <ItemPicker id={id} label="Exercise" kind="exercise" value={name} mine={mine} catalogMeta={catalogMeta}
        placeholder="Type to search or add, e.g. Cable Lateral Raise" createLabel={n => `Create “${n}” as a new exercise`}
        onText={onText} onPick={c => onCat?.(c.kind === 'catalog' ? c.item : null)} />
      {onUrl && name.trim() !== '' && <label className="field">Video link (optional)<input type="url" value={url ?? ''} placeholder="https://" onChange={e => onUrl(e.target.value)} /></label>}
      {held && <p className="note">From the catalog. It will be added to your exercise library when you save.</p>}
      {isNew && <p className="note">New exercise. It will be added to your exercise list.</p>}
      {onEq && name.trim() !== '' && (
        <EquipmentField cfg={cfg} value={eq as EquipmentId | ''} onChange={onEq} />
      )}
    </>
  );
}
