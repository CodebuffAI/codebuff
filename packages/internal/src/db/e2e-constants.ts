/**
 * Shared constants for E2E testing infrastructure.
 * Used by e2e-setup.ts, playwright.config.ts, and playwright-runner.test.ts
 */

export const DEFAULT_E2E_DATABASE_URL =
  'postgresql://manicode_user_local:secretpassword_local@localhost:5433/manicode_db_e2e'

export const getE2EDatabaseUrl = (): string =>
  process.env.E2E_DATABASE_URL || DEFAULT_E2E_DATABASE_URL
