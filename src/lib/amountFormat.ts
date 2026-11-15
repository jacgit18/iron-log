/** 1250 becomes "1,250"; at most two decimals, none when whole. Shared by the vitamin and mineral rows and the active ingredient rows. */
export const fmtAmount = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
