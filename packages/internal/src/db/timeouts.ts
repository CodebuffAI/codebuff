/**
 * Timeout policy for the shared Postgres client (see ./index.ts), in one
 * place because the values are coupled:
 *
 * - DB_LOCK_TIMEOUT_MS (10s) is the connection-level default: statements stop
 *   waiting on locks instead of blocking a pool slot indefinitely.
 * - ADVISORY_LOCK_TIMEOUT_MS (30s) is how long withAdvisoryLockTransaction is
 *   willing to wait for its advisory lock. Postgres's lock_timeout also
 *   cancels pg_advisory_xact_lock() waits, so the wrapper overrides the
 *   connection default per-transaction (SET LOCAL) to get this full window —
 *   keep it above DB_LOCK_TIMEOUT_MS or the override is pointless.
 * - DB_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS (60s) is the backstop that
 *   frees locks held by dead peers: the server kills sessions whose open
 *   transaction sits idle. Retry backoff in ./transaction.ts is sized to
 *   outlast it (a waiter that hits lock_timeout retries until the reaper
 *   frees the lock).
 */

/** Connect timeout for postgres-js clients. SECONDS (postgres-js option unit). */
export const DB_CONNECT_TIMEOUT_SECONDS = 10

/** Connection-level lock_timeout GUC. Milliseconds. */
export const DB_LOCK_TIMEOUT_MS = 10_000

/** Connection-level idle_in_transaction_session_timeout GUC. Milliseconds. */
export const DB_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS = 60_000

/**
 * Default advisory-lock acquisition window for withAdvisoryLockTransaction.
 * Milliseconds. Must stay above DB_LOCK_TIMEOUT_MS (see file comment).
 */
export const ADVISORY_LOCK_TIMEOUT_MS = 30_000
