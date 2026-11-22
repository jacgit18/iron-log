// Thrown by allWeeks() when some saved weeks could not be read, so a caller never works from a partial list (ADR: refuse over partial).
export class HistoryIncompleteError extends Error {
  constructor() { super('Some saved weeks could not be read'); this.name = 'HistoryIncompleteError'; }
}
