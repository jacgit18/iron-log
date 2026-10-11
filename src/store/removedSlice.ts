import type { Flag, RemovedSlice, StoreGet, StoreSet } from './types.ts';

// The single item the last delete or remove took out, so a notice can offer Undo (ADR 023). One at a time: a newer
// removal replaces it. `scope` names the list it came from, and only that list shows the notice (RemovedNotice).
// `restore` puts the item back through the same save path the delete used (so it syncs like any other change), and
// returns false when it could not.
let seq = 0;

export const removedSlice = (set: StoreSet, get: StoreGet, flag: Flag): RemovedSlice => ({
  removed: null,
  noteRemoved(scope, text, restore) { set({ removed: { id: ++seq, scope, text, restore } }); },
  undoRemoved() {
    const r = get().removed; if (!r) return;
    set({ removed: null });
    if (r.restore() !== false) flag('Put back');
  },
  dismissRemoved(scope) { const r = get().removed; if (r && (scope == null || r.scope === scope)) set({ removed: null }); },
});
