/**
 * Mock utilities index.
 *
 * Re-exports all mock factories for convenient importing.
 */

export {
  createMockLogger,
  createMockLoggerWithCapture,
  restoreMockLogger,
  clearMockLogger,
} from './logger'
export type {
  LogLevel,
  LogMethod,
  MockLogMethod,
  MockLogger,
  CreateMockLoggerOptions,
  CapturedLogEntry,
  MockLoggerWithCapture,
} from './logger'

export {
  createMockAnalytics,
  createMockAnalyticsWithCapture,
  setupAnalyticsMocks,
  restoreMockAnalytics,
} from './analytics'
export type {
  MockAnalytics,
  MockAnalyticsWithCapture,
  AnalyticsSpies,
  CreateMockAnalyticsOptions,
  TrackedEvent,
  EventProperties,
} from './analytics'

export { createMockDbOperations, setupDbSpies } from './database'
export type { MockDbOperations, DbSpies, CreateMockDbOptions } from './database'

export { setupCryptoMocks, createMockUuid, TEST_UUIDS } from './crypto'
export type { CryptoMockSpies, UUID, SetupCryptoMocksOptions } from './crypto'
export { createUuidGenerator, setupSequentialCryptoMocks } from './crypto'

export {
  createToolCallChunk,
  createMockStream,
  createMockTextStream,
} from './stream'

export { createMockTimers, installMockTimers } from './timers'
export type { PendingTimer, MockTimers } from './timers'

export { createMockFs, restoreMockFs, clearMockFs } from './filesystem'
export type { MockFs, MockFsWithMocks, CreateMockFsOptions } from './filesystem'

export {
  createMockFetch,
  installMockFetch,
  mockJsonResponse,
  mockTextResponse,
  mockErrorResponse,
} from './fetch'
export type {
  MockFetch,
  MockFetchCall,
  MockResponseOptions,
  CreateMockFetchOptions,
  InstallMockFetchResult,
} from './fetch'

export {
  createMockCapture,
  createMockTreeSitterCaptures,
  createMockTree,
  createMockTreeSitterParser,
  createMockTreeSitterQuery,
  createMockLanguageConfig,
} from './tree-sitter'
export type {
  MockTreeNode,
  MockTree,
  MockCapture,
  MockParser,
  MockQuery,
  CreateMockParserOptions,
  CreateMockQueryOptions,
  CreateMockLanguageConfigOptions,
} from './tree-sitter'
