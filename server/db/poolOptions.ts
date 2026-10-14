// Limits for every pg pool the server opens (EH-02 to EH-04). Without them a slow or stuck database holds each request, and so each
// connection, until Cloud Run's own request timeout, and the single small instance stops answering for everyone.
export const POOL_OPTIONS = {
  // Cloud Run runs one small instance; Neon's free tier has few connections. Enough for the sync bursts, not enough to starve the database.
  max: 10,
  // Waiting for a free connection, or for Neon to wake from scale-to-zero, longer than this is an error the phone can retry.
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  // A query that runs this long is stuck; the server cancels it and the request gets a 503.
  statement_timeout: 15_000,
  // A transaction left open by a crashed request would hold its row locks; the server ends it.
  idle_in_transaction_session_timeout: 15_000,
} as const;
