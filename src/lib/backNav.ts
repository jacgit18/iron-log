// Phone Back (swipe or button) walks the app's own history instead of leaving it: each tab change and each open sheet is one history entry.
// These are the pure decisions; src/hooks/useBackButton.ts does the history calls. The entry's state is `{ nav: { tab, modal } }`.

export type Nav = { tab: string; modal: boolean };
export type Op = { kind: 'push' | 'replace'; nav: Nav } | { kind: 'back' };

export function navOf(state: unknown): Nav | null {
  const n = (state as { nav?: { tab?: unknown; modal?: unknown } } | null)?.nav;
  return n && typeof n.tab === 'string' ? { tab: n.tab, modal: n.modal === true } : null;
}

// What to do to the history when the store went from `prev` to `next`. `onModalEntry`: the current entry is the one a sheet pushed.
export function opsFor(prev: Nav, next: Nav, onModalEntry: boolean): Op[] {
  const tabChanged = prev.tab !== next.tab;
  if (next.modal && !prev.modal) return [{ kind: 'push', nav: next }];
  if (!next.modal && prev.modal) {
    if (!onModalEntry) return tabChanged ? [{ kind: 'push', nav: next }] : [];
    // A sheet that closes by choosing a tab turns its own entry into that tab's entry; otherwise its entry is taken back.
    return tabChanged ? [{ kind: 'replace', nav: next }] : [{ kind: 'back' }];
  }
  // The first replace drops anything another screen left in the entry we are leaving (Settings' open screen), so its cleanup does not go Back a second time.
  return tabChanged ? [{ kind: 'replace', nav: prev }, { kind: 'push', nav: next }] : [];
}

// What the app should do after Back or Forward landed on an entry of ours; an entry without our state is left alone.
export function onPop(state: unknown, cur: Nav): { tab?: string; closeModal?: boolean } {
  const n = navOf(state);
  if (!n) return {};
  return { ...(n.tab !== cur.tab ? { tab: n.tab } : {}), ...(!n.modal && cur.modal ? { closeModal: true } : {}) };
}
