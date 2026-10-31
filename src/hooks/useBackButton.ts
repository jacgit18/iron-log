import { useEffect } from 'react';
import { navOf, onPop, opsFor, type Nav } from '../lib/backNav.js';
import { useAppStore } from '../store/useAppStore.js';

/**
 * Makes the phone's Back (swipe or button) go to the previous tab, or close the open sheet, instead of leaving the app.
 * One history entry per tab change and per open sheet; the decisions are in src/lib/backNav.ts. Settings' own screens keep their entries (Settings.tsx).
 */
export default function useBackButton() {
  useEffect(() => {
    const read = (): Nav => { const s = useAppStore.getState(); return { tab: s.tab, modal: s.modal !== null }; };
    let cur = read(); // what the history entries were last made for
    let popping = false; // the store is changing because Back did, so the history already says so
    history.replaceState({ ...history.state, nav: cur }, '');

    const off = useAppStore.subscribe(() => {
      const next = read();
      const prev = cur; cur = next;
      if (popping) return;
      for (const op of opsFor(prev, next, navOf(history.state)?.modal === true)) {
        if (op.kind === 'back') history.back();
        else if (op.kind === 'push') history.pushState({ nav: op.nav }, '');
        else history.replaceState({ nav: op.nav }, '');
      }
    });
    const onPopState = (e: PopStateEvent) => {
      const todo = onPop(e.state, cur);
      popping = true;
      try {
        if (todo.tab) useAppStore.getState().setTab(todo.tab);
        if (todo.closeModal) useAppStore.getState().closeModal();
      } finally { popping = false; }
    };
    window.addEventListener('popstate', onPopState);
    return () => { off(); window.removeEventListener('popstate', onPopState); };
  }, []);
}
