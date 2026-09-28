import { create } from 'zustand';

// Install and storage state for the "App on this device" panel.
export const usePwa = create(() => ({
  installEvent: null, // Chrome/Edge/Android: the deferred beforeinstallprompt event
  installed: false,
  persisted: null, // true / false once known; null when the browser can't say
}));

export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
// iPhone/iPad Safari has no install prompt; it's done from the Share menu.
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function initPwa() {
  usePwa.setState({ installed: isStandalone() });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); usePwa.setState({ installEvent: e }); });
  window.addEventListener('appinstalled', () => { usePwa.setState({ installEvent: null, installed: true }); keepData(); });
  navigator.storage?.persisted?.().then(p => usePwa.setState({ persisted: p })).catch(() => {});
  // Installed apps ask quietly on start; most browsers grant it without a prompt.
  if (isStandalone()) keepData();
}

export async function install() {
  const e = usePwa.getState().installEvent; if (!e) return;
  e.prompt();
  const { outcome } = await e.userChoice.catch(() => ({ outcome: 'dismissed' }));
  usePwa.setState({ installEvent: null, ...(outcome === 'accepted' ? { installed: true } : {}) });
}

// Ask the browser not to clear this site's storage (your log lives there) when space runs low.
export async function keepData() {
  if (!navigator.storage?.persist) return null;
  const p = await navigator.storage.persist().catch(() => false);
  usePwa.setState({ persisted: p });
  return p;
}
