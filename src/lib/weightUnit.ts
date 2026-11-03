// Pounds are what is typed and stored (ADR 006). The kg figure shown beside a pound weight is display only.
const KG_PER_LB = 0.45359237;

/** "61.2 kg" for a pound weight, or '' when there is nothing sensible to show (empty, zero, negative, not a number). */
export function kgText(lb: unknown): string {
  if (lb === '' || lb == null) return '';
  const n = Number(lb);
  if (!Number.isFinite(n) || n <= 0) return '';
  const kg = Math.round(n * KG_PER_LB * 10) / 10;
  return `${String(kg).replace(/\.0$/, '')} kg`;
}
