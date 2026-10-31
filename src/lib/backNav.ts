// Phone Back (swipe or button) walks the app's own history instead of leaving it: each tab change and each open sheet is one history entry.
// `opsFor` and `onPop` are the pure decisions; `startBackNav` applies them to a history and a store (both passed in, so a test can fake them). The entry's state is `{ nav: { tab, modal } }`.

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

type Store = { getState(): { tab: string; modal: unknown; setTab(t: string): void; closeModal(): void }; subscribe(fn: () => void): () => void };
type Hist = { state: unknown; replaceState(s: unknown, t: string): void; pushState(s: unknown, t: string): void; back(): void };
type Win = { addEventListener(e: 'popstate', fn: (ev: { state: unknown }) => void): void; removeEventListener(e: 'popstate', fn: (ev: { state: unknown }) => void): void };

/** Keeps the history in step with the store's tab and sheet, and the store in step with Back. Returns the function that stops it. */
export function startBackNav(store: Store, history: Hist, win: Win): () => void {
  const read = (): Nav => { const s = store.getState(); return { tab: s.tab, modal: s.modal !== null }; };
  let cur = read(); // what the history entries were last made for
  let popping = false; // the store is changing because Back did, so the history already says so
  history.replaceState({ ...(history.state as object | null), nav: cur }, '');
  const off = store.subscribe(() => {
    const next = read();
    const prev = cur; cur = next;
    if (popping) return;
    for (const op of opsFor(prev, next, navOf(history.state)?.modal === true)) {
      if (op.kind === 'back') history.back();
      else if (op.kind === 'push') history.pushState({ nav: op.nav }, '');
      else history.replaceState({ nav: op.nav }, '');
    }
  });
  const onPopState = (e: { state: unknown }) => {
    const todo = onPop(e.state, cur);
    popping = true;
    try {
      if (todo.tab) store.getState().setTab(todo.tab);
      if (todo.closeModal) store.getState().closeModal();
    } finally { popping = false; }
  };
  win.addEventListener('popstate', onPopState);
  return () => { off(); win.removeEventListener('popstate', onPopState); };
}
