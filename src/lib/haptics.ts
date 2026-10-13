/** A short buzz where the browser has one (Android Chrome; iPhone has none). Never throws. */
export function haptic(pattern: number | number[]): void {
  try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern); } catch { /* unsupported */ }
}
