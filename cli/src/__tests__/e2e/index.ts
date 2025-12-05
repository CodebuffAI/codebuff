/**
 * E2E Testing Utilities
 *
 * This module provides utilities for running end-to-end tests against
 * a real Codebuff server with a real database.
 *
 * Usage:
 *   import { createE2ETestContext, E2E_TEST_USERS } from './e2e'
 *
 *   describe('My E2E Tests', () => {
 *     let ctx: E2ETestContext
 *
 *     beforeAll(async () => {
 *       ctx = await createE2ETestContext('my-test-suite')
 *     })
 *
 *     afterAll(async () => {
 *       await ctx.cleanup()
 *     })
 *
 *     test('example test', async () => {
 *       const session = await ctx.createSession(E2E_TEST_USERS.default)
 *       // ... test code ...
 *     })
 *   })
 */

export {
  createE2EDatabase,
  destroyE2EDatabase,
  cleanupOrphanedContainers,
  E2E_TEST_USERS,
  type E2EDatabase,
  type E2ETestUser,
} from './test-db-utils'

export {
  startE2EServer,
  stopE2EServer,
  cleanupOrphanedServers,
  type E2EServer,
} from './test-server-utils'

export {
  launchAuthenticatedCLI,
  closeE2ESession,
  createE2ETestContext,
  createTestCredentials,
  cleanupCredentials,
  sleep,
  type E2ESession,
  type E2ETestContext,
} from './test-cli-utils'
