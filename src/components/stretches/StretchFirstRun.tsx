import { useAppStore } from '../../store/useAppStore.js';

// Shown when the stretch list is empty: a brand-new account (ADR 016) or one that deleted every stretch. The button opens the same
// new-stretch sheet as "+ New stretch" in the Program tab.
export default function StretchFirstRun() {
  const openModal = useAppStore.getState().openModal;
  return (
    <section className="notice firstrun" aria-labelledby="sfirstrun-h">
      <h3 id="sfirstrun-h">Build your stretch routine</h3>
      <p>Your stretch list is empty. Add the stretches you do, and choose for each whether it is for every day or once in a while. The daily ones show up here to tick off.</p>
      <div className="actions">
        <button type="button" className="btn primary" id="sfirstrun-add" onClick={() => openModal({ type: 'stretch' })}>Add your first stretch</button>
      </div>
      <p className="note">You can manage the whole list later in the Program tab.</p>
    </section>
  );
}
