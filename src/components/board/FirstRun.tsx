import { useAppStore } from '../../store/useAppStore.js';

// Shown when the board has no exercises at all: a brand-new account (ADR 016) or one that removed every card. It points at the same
// "+ Add exercise" flow each day column has, so there is one way to add a card, not two.
export default function FirstRun() {
  const st = useAppStore.getState();
  return (
    <section className="notice firstrun" aria-labelledby="firstrun-h">
      <h3 id="firstrun-h">Build your first workout</h3>
      <p>Your board is empty. Add the exercises you train, and the day you train each one. They show up here, ready to check off or log.</p>
      <div className="actions">
        <button type="button" className="btn primary" id="firstrun-add" onClick={() => st.openAddToProgram(1)}>Add your first exercise</button>
      </div>
      <p className="note">Each day below has its own &ldquo;+ Add exercise&rdquo; button, and the Program tab edits the whole week.</p>
    </section>
  );
}
