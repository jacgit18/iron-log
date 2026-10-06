import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore.js';

// Tracks whether the last interaction was the keyboard (vs pointer).
export const input = { keyboard: false };

// When an action re-renders the focused control somewhere else (a checked card drops to the done
// section, a card moves to another day), React creates a new element and focus falls to <body>.
// Put focus back on the element with the same id. Keyboard users are scrolled to it; pointer users
// are not, so the page doesn't jump under the mouse.
export default function useFocusKeeper() {
  useEffect(() => {
    let lastId: string | null = null;
    const onKey = () => { input.keyboard = true; };
    const onPointer = () => { input.keyboard = false; };
    const onIn = (e: FocusEvent) => { lastId = (e.target as HTMLElement).id || null; };
    // Focus moving to another element is handled by focusin. Focus going nowhere is either a real blur
    // (click on empty page: the element is still there → forget it) or the element being removed (keep it).
    const onOut = (e: FocusEvent) => {
      if (e.relatedTarget) return;
      const t = e.target as HTMLElement;
      setTimeout(() => { if (t.isConnected && lastId === t.id) lastId = null; }, 0);
    };
    // React may commit the re-render after this task, so try again over the next few frames.
    const restore = () => [0, 16, 50, 120].forEach(ms => setTimeout(tryRestore, ms));
    const tryRestore = () => {
      // Browsers move focus off a removed element lazily (at the next frame), so a disconnected
      // activeElement counts as lost too.
      const a = document.activeElement;
      if (!lastId || (a && a !== document.body && a.isConnected)) return;
      const el = document.getElementById(lastId);
      if (el && !(el as HTMLButtonElement).disabled) el.focus({ preventScroll: !input.keyboard });
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    const unsub = useAppStore.subscribe(restore);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
      unsub();
    };
  }, []);
}
