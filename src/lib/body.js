export const bwSorted = body => [...body].filter(e => e && e.wk && Number(e.w) > 0).sort((a, b) => a.wk.localeCompare(b.wk));
export const fmtLb = n => `${Math.round(Number(n) * 10) / 10}`;
export const signed = (n, dp = 0) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(dp)}`;
