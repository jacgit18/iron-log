// Limits for every pg pool the server opens (EH-02 to EH-04). Without them a slow or stuck database holds each request, and so each
// connection, until Cloud Run's own request timeout, and the single small instance stops answering for everyone.
export const POOL_OPTIONS = {
  // Cloud Run runs one small instance; Neon's free tier has few connections. Enough for the sync bursts, not enough to starve the database.
  max: 10,
  // Waiting for a free connection, or for Neon to wake from scale-to-zero, longer than this is an error the phone can retry.
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  // Client-side backstop for a query that never answers. The server-side limits (statement_timeout, idle_in_transaction_session_timeout)
  // are NOT set here: node-postgres would send them as startup parameters, which Neon's pooled (PgBouncer) endpoint, the one production
  // uses, refuses or ignores. They are applied per transaction instead (TRANSACTION_LIMITS, used by inUserTransaction).
  query_timeout: 20_000,
} as const;

/** Server-side limits, set with SET LOCAL at the start of each transaction so they work through a transaction pooler. */
export const TRANSACTION_LIMITS = { statement_timeout: '15s', idle_in_transaction_session_timeout: '15s' } as const;
