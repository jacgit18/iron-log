/** How long one request to the API may take, answer and body together, before it counts as a network failure. Long on purpose: Cloud Run and Neon
 *  cold starts stack (ADR 010). A leaf module so the app's start-up code (`account.ts`) can share it without pulling in the lazily loaded transport. */
export const DEFAULT_TIMEOUT_MS = 60_000;
