import { create } from 'zustand';
import { useAppStore, flag } from './useAppStore.js';

// Kept apart from the app store so the 250 ms tick only re-renders the timer bar.
let iv = null, lock = null, actx = null, beeped = {};

function beep(freq = 880, ms = 160) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(0.25, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + ms / 1000);
    o.start(); o.stop(actx.currentTime + ms / 1000);
  } catch { /* audio unavailable */ }
}
function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch { /* unsupported */ } }
async function wake(on) {
  try {
    if (on && !lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener?.('release', () => { lock = null; }); }
    else if (!on && lock) { await lock.release(); lock = null; }
  } catch { lock = null; }
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && useTimerStore.getState().mode) wake(true); });

const restSecs = () => Math.max(0, Number(useAppStore.getState().cfg.rest ?? 90));
export const mmss = sec => { const s = Math.ceil(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export const useTimerStore = create((set, get) => ({
  mode: null, // 'rest' | 'hold' | 'holdrest'
  label: '', exName: '',
  end: 0, dur: 0, paused: null, // paused = seconds left while paused
  sets: 0, set: 0, hold: 0,
  now: Date.now(),

  remaining() { const s = get(); return s.paused != null ? s.paused : Math.max(0, (s.end - Date.now()) / 1000); },

  start(mode, secs, label) {
    set({ mode, dur: secs, end: Date.now() + secs * 1000, paused: null, label });
    beeped = {}; clearInterval(iv); iv = setInterval(tick, 250); wake(true);
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume?.(); } catch { /* audio unavailable */ }
    tick();
  },
  startRest() { set({ sets: 0 }); get().start('rest', restSecs() || 90, 'Rest'); },
  startHold(exName, sets, hold) { set({ sets, set: 1, hold, exName }); get().start('hold', hold, `Hold · ${exName}`); },
  stop() { clearInterval(iv); iv = null; set({ mode: null }); wake(false); },
  togglePause() {
    const s = get();
    if (s.paused != null) set({ end: Date.now() + s.paused * 1000, paused: null });
    else set({ paused: s.remaining() });
  },
  nudge(d) {
    const s = get();
    if (s.paused != null) set({ paused: Math.max(1, s.paused + d) });
    else set({ end: Math.max(Date.now() + 1000, s.end + d * 1000) });
    set({ dur: Math.max(get().dur, get().remaining()) });
  },
}));

function tick() {
  const t = useTimerStore.getState();
  const r = t.remaining(); const whole = Math.ceil(r);
  if (t.paused == null && whole <= 3 && whole > 0 && !beeped[whole]) { beeped[whole] = 1; beep(660, 90); }
  if (t.paused == null && r <= 0) {
    beep(990, 300); buzz([200, 80, 200]);
    if (t.mode === 'hold' && t.sets) {
      if (t.set < t.sets) {
        const rs = restSecs();
        if (rs > 0) { t.start('holdrest', rs, `Rest · then hold ${t.set + 1}/${t.sets}`); return; }
        useTimerStore.setState({ set: t.set + 1 }); t.start('hold', t.hold, `Hold · ${t.exName}`); return;
      }
      t.stop(); flag(`${t.exName}: all ${t.sets} holds done`); return;
    }
    if (t.mode === 'holdrest') { useTimerStore.setState({ set: t.set + 1 }); t.start('hold', t.hold, `Hold · ${t.exName}`); return; }
    t.stop(); return;
  }
  useTimerStore.setState({ now: Date.now() });
}
