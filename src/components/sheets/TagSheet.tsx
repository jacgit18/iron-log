import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { exInfo } from '../../lib/data.js';
import { MUSCLE_MAP, draftOfTags, tagsOfDraft } from '../../lib/muscles.js';
import MuscleChips from '../muscles/MuscleChips.jsx';
import Sheet from '../Sheet.jsx';
import ArmedButton from '../ArmedButton.jsx';

export default function TagSheet({ exId }: { exId: string }) {
  const cfg = useAppStore(s => s.cfg);
  const { saveTags, resetTags, closeModal } = useAppStore.getState();
  const [draft, setDraft] = useState(() => draftOfTags(cfg, exId));
  const custom = !!(cfg.muscleMap && cfg.muscleMap[exId]);

  return (
    <Sheet>
      <h2 className="cond">{exInfo(cfg, exId).n}</h2>
      <p className="note">Tap a muscle to cycle: not used → secondary → primary.</p>
      <MuscleChips draft={draft} setDraft={setDraft} mobId="tag-mob" />
      <div className="actions">
        {custom && MUSCLE_MAP[exId] && <ArmedButton className="btn ghost" style={{ marginRight: 'auto' }} label="Use default" armedLabel="Tap again to use default" onConfirm={() => resetTags(exId)} />}
        <button type="button" className="btn" onClick={closeModal}>Cancel</button>
        <button type="button" className="btn primary" onClick={() => saveTags(exId, tagsOfDraft(draft))}>Save</button>
      </div>
    </Sheet>
  );
}
