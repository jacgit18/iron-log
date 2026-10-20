/* ---------- Sales tax from the receipt ----------
   The owner types the tax in dollars, as the receipt says it, for a store and a month; the app only shows what that comes to as a percent of
   what was bought (a check that it looks right, not a rate that is applied). Pure; whole cents. */

/** The tax as a percent of the subtotal, for display: "8.88%". Empty when there is no tax or nothing bought. */
export const taxPercentText = (tax: number, subtotal: number): string => (tax > 0 && subtotal > 0 ? `${((tax / subtotal) * 100).toFixed(2)}%` : '');
