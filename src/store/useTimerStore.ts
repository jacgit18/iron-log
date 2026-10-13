import { create } from 'zustand';
import { useAppStore, flag } from './useAppStore.js';
import { restNotifyOn, showRestNotice, clearRestNotice } from '../lib/restNotify.js';

// Kept apart from the app store so the 250 ms tick only re-renders the timer bar.
type AudioCtor = typeof AudioContext;
const audioCtor = (): AudioCtor => window.AudioContext || (window as unknown as { webkitAudioContext: AudioCtor }).webkitAudioContext;
let iv: ReturnType<typeof setInterval> | null = null, lock: WakeLockSentinel | null = null, actx: AudioContext | null = null, beeped: Record<number, number> = {};

function beep(freq = 880, ms = 160) {
  try {
    actx = actx || new (audioCtor())();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(0.25, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + ms / 1000);
    o.start(); o.stop(actx.currentTime + ms / 1000);
  } catch { /* audio unavailable */ }
}
function buzz(p: number | number[]) { try { if (navigator.vibrate) navigator.vibrate(p); } catch { /* unsupported */ } }
async function wake(on: boolean) {
  try {
    if (on && !lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener?.('release', () => { lock = null; }); }
    else if (!on && lock) { await lock.release(); lock = null; }
  } catch { lock = null; }
}
const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
// A hidden page's interval is throttled or frozen. Back in front: take the wake lock again, catch the timer up to the clock
// (it may have ended, or run through several holds, while away) and take down the "rest over" notice.
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  clearRestNotice();
  if (useTimerStore.getState().mode) { wake(true); tick(); }
});

// One timeout at the end time, besides the 250 ms interval: a background page's interval can be held back, but a
// single timeout is usually let through, so the end of a rest still fires (and notifies) on time.
let to: ReturnType<typeof setTimeout> | null = null;
function disarm() { if (to) clearTimeout(to); to = null; }
function arm() {
  disarm();
  const s = useTimerStore.getState();
  if (s.mode && s.paused == null) to = setTimeout(() => { to = null; tick(); arm(); }, Math.max(0, s.end - Date.now()) + 20);
}

const restSecs = () => Math.max(0, Number(useAppStore.getState().cfg.rest ?? 90));
export const mmss = (sec: number) => { const s = Math.ceil(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

type TimerMode = 'rest' | 'hold' | 'holdrest';
interface TimerState {
  mode: TimerMode | null;
  label: string;
  exName: string;
  end: number;
  dur: number;
  paused: number | null; // seconds left while paused
  sets: number;
  set: number;
  hold: number;
  now: number;
  remaining(): number;
  /** `from` is when the phase began, if that was before now (a phase that ended while the page was hidden). */
  start(mode: TimerMode, secs: number, label: string, from?: number): void;
  startRest(): void;
  startHold(exName: string, sets: number, hold: number): void;
  stop(): void;
  togglePause(): void;
  nudge(d: number): void;
}

export const useTimerStore = create<TimerState>((set, get) => ({
  mode: null,
  label: '', exName: '',
  end: 0, dur: 0, paused: null, // paused = seconds left while paused
  sets: 0, set: 0, hold: 0,
  now: Date.now(),

  remaining() { const s = get(); return s.paused != null ? s.paused : Math.max(0, (s.end - Date.now()) / 1000); },

  start(mode, secs, label, from = Date.now()) {
    set({ mode, dur: secs, end: from + secs * 1000, paused: null, label });
    beeped = {}; if (iv) clearInterval(iv); iv = setInterval(tick, 250); wake(true); arm();
    try { actx = actx || new (audioCtor())(); actx.resume?.(); } catch { /* audio unavailable */ }
    tick();
  },
  startRest() { set({ sets: 0 }); get().start('rest', restSecs() || 90, 'Rest'); },
  startHold(exName, sets, hold) { set({ sets, set: 1, hold, exName }); get().start('hold', hold, `Hold · ${exName}`); },
  stop() { if (iv) clearInterval(iv); iv = null; disarm(); set({ mode: null }); wake(false); },
  togglePause() {
    const s = get();
    if (s.paused != null) set({ end: Date.now() + s.paused * 1000, paused: null });
    else set({ paused: s.remaining() });
    arm();
  },
  nudge(d) {
    const s = get();
    if (s.paused != null) set({ paused: Math.max(1, s.paused + d) });
    else set({ end: Math.max(Date.now() + 1000, s.end + d * 1000) });
    set({ dur: Math.max(get().dur, get().remaining()) });
    arm();
  },
}));

// What the notification says when the phase `t` has just ended.
function endNote(t: TimerState): string {
  if (t.mode === 'rest') return 'Rest over. Time for your next set.';
  if (t.mode === 'holdrest') return `Rest over. Hold ${t.set + 1}/${t.sets} is next.`;
  if (t.sets && t.set < t.sets) return `Hold ${t.set}/${t.sets} done.`;
  return t.sets ? `${t.exName}: all ${t.sets} holds done.` : 'Hold done.';
}

function tick() {
  const t = useTimerStore.getState();
  if (!t.mode) return; // the interval and the end timeout can both land on the same moment
  const r = t.remaining(); const whole = Math.ceil(r);
  if (t.paused == null && whole <= 3 && whole > 0 && !beeped[whole]) { beeped[whole] = 1; beep(660, 90); }
  if (t.paused == null && r <= 0) {
    // Seconds past the end (remaining() stops at 0, so read the clock). A phase that ended while the page was hidden is
    // announced by the notification, not by a beep and a buzz that arrive late when the person comes back.
    if ((Date.now() - t.end) / 1000 <= 2) { beep(990, 300); buzz([200, 80, 200]); }
    if (hidden() && restNotifyOn()) showRestNotice(endNote(t));
    // The next phase starts when this one ended, not now, so a catch-up after a long absence lands in the right place.
    if (t.mode === 'hold' && t.sets) {
      if (t.set < t.sets) {
        const rs = restSecs();
        if (rs > 0) { t.start('holdrest', rs, `Rest · then hold ${t.set + 1}/${t.sets}`, t.end); return; }
        useTimerStore.setState({ set: t.set + 1 }); t.start('hold', t.hold, `Hold · ${t.exName}`, t.end); return;
      }
      t.stop(); flag(`${t.exName}: all ${t.sets} holds done`); return;
    }
    if (t.mode === 'holdrest') { useTimerStore.setState({ set: t.set + 1 }); t.start('hold', t.hold, `Hold · ${t.exName}`, t.end); return; }
    t.stop(); return;
  }
  useTimerStore.setState({ now: Date.now() });
}
