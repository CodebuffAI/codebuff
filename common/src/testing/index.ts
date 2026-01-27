/**
 * Consolidated testing utilities for Codebuff.
 *
 * This module re-exports all testing utilities from a single entry point,
 * making it easy to import everything you need for testing.
 *
 * ## Module Overview
 *
 * - **mocks**: Typed mock factories for logger, analytics, database, crypto, and streams
 * - **fixtures**: Pre-built test fixtures for agent runtime and other components
 * - **errors**: Typed error creators for testing error handling
 * - **mock-modules**: Dynamic module mocking utilities
 * - **env**: Test environment helpers
 *
 * @example
 * ```typescript
 * import {
 *   // Mock factories
 *   createMockLogger,
 *   createMockAnalytics,
 *   setupDbSpies,
 *   setupCryptoMocks,
 *
 *   // Fixtures
 *   createTestAgentRuntimeParams,
 *
 *   // Errors
 *   createNodeError,
 *
 *   // Module mocking
 *   mockModule,
 *   clearMockedModules,
 * } from '@codebuff/common/testing'
 * ```
 *
 * @module testing
 */

// ============================================================================
// Mock Factories
// ============================================================================

export * from './mocks'

// ============================================================================
// Fixtures
// ============================================================================

export {
  createTestAgentRuntimeParams,
  createTestAgentRuntimeDeps,
  mockFileContext,
} from './fixtures/agent-runtime'
export type { TestAgentRuntimeParams } from './fixtures/agent-runtime'

// ============================================================================
// Error Utilities
// ============================================================================

export { createNodeError, createPostgresError } from './errors'
export type { NodeError, PostgresError } from './errors'

// ============================================================================
// Module Mocking
// ============================================================================

export { mockModule, clearMockedModules } from './mock-modules'

// ============================================================================
// Test Setup Utilities
// ============================================================================

export { createTestSetup, sleep, waitFor, captureCallArgs } from './setup'
export type { CreateTestSetupOptions, TestSetupResult } from './setup'

// ============================================================================
// Environment Helpers (re-exported from sibling modules)
// ============================================================================

// Note: These are in separate files for historical reasons but are commonly
// used together with other testing utilities.
// Import directly from their modules if you need only env helpers:
//   - '@codebuff/common/testing-env-process' for process env
//   - '@codebuff/common/testing-env-ci' for CI env
