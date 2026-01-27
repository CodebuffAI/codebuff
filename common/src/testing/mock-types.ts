/**
 * Shared mock types for testing.
 *
 * This module provides common mock types and factory functions that are
 * frequently used across test files. Using these shared types ensures
 * consistency and reduces duplication in test code.
 *
 * @example
 * ```typescript
 * import {
 *   createMockLogger,
 *   type MockUserInfo,
 *   type MockCreditResult,
 * } from '@codebuff/common/testing/mock-types'
 *
 * const logger = createMockLogger()
 * const userInfo: MockUserInfo = { id: 'user-123' }
 * ```
 */

import { mock } from 'bun:test'

import type { Logger } from '../types/contracts/logger'

/**
 * Mock user info returned by API key lookup functions.
 * Contains the minimal user identification data needed for testing.
 */
export interface MockUserInfo {
  id: string
}

/**
 * Mock result from credit consumption operations.
 * Used when testing billing-related functionality.
 */
export interface MockCreditResult {
  success: boolean
  value: { chargedToOrganization: boolean }
}

/**
 * Mock file stat result for filesystem operations.
 * Provides typed methods for checking file type.
 */
export interface MockStatResult {
  isDirectory: () => boolean
  isFile: () => boolean
}

/**
 * Typed mock logger where each method is a Bun test mock.
 * Useful for verifying that specific log methods were called.
 */
export type MockLogger = {
  [K in keyof Logger]: ReturnType<typeof mock> & Logger[K]
}

/**
 * Creates a mock logger with all methods as Bun test mocks.
 * Each method can be inspected for calls using mock.calls.
 *
 * @example
 * ```typescript
 * const logger = createMockLogger()
 * someFunction({ logger })
 * expect(logger.error.mock.calls.length).toBe(1)
 * ```
 */
export function createMockLogger(): MockLogger {
  return {
    info: mock(() => {}) as ReturnType<typeof mock> & Logger['info'],
    error: mock(() => {}) as ReturnType<typeof mock> & Logger['error'],
    warn: mock(() => {}) as ReturnType<typeof mock> & Logger['warn'],
    debug: mock(() => {}) as ReturnType<typeof mock> & Logger['debug'],
  }
}

/**
 * Creates a mock stat result for filesystem testing.
 *
 * @param options - Configure whether the mock represents a directory or file
 * @returns A MockStatResult with the specified behavior
 *
 * @example
 * ```typescript
 * const dirStat = createMockStatResult({ isDirectory: true })
 * const fileStat = createMockStatResult({ isFile: true })
 * ```
 */
export function createMockStatResult(options: {
  isDirectory?: boolean
  isFile?: boolean
}): MockStatResult {
  return {
    isDirectory: () => options.isDirectory ?? false,
    isFile: () => options.isFile ?? false,
  }
}

/**
 * Creates a mock credit result for billing-related tests.
 *
 * @param options - Configure the success state and organization charging
 * @returns A MockCreditResult with the specified values
 *
 * @example
 * ```typescript
 * const successResult = createMockCreditResult({ success: true })
 * const orgResult = createMockCreditResult({ success: true, chargedToOrganization: true })
 * ```
 */
export function createMockCreditResult(
  options: {
    success?: boolean
    chargedToOrganization?: boolean
  } = {},
): MockCreditResult {
  return {
    success: options.success ?? true,
    value: { chargedToOrganization: options.chargedToOrganization ?? false },
  }
}
