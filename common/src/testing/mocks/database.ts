/**
 * Typed database mock factory for testing.
 *
 * Provides type-safe mocks for Drizzle database operations used throughout the codebase.
 * Replaces the need for `as any` casts when setting up database spies.
 *
 * @example
 * ```typescript
 * import { createMockDbOperations, setupDbSpies } from '@codebuff/common/testing/mocks/database'
 *
 * // Option 1: Create mock operations object
 * const dbOps = createMockDbOperations()
 *
 * // Option 2: Setup spies on actual db module
 * const spies = setupDbSpies(db)
 * await runTest()
 * spies.restore()
 * ```
 */

import { mock, spyOn } from 'bun:test'

import type { Mock } from 'bun:test'

/**
 * Type for the chainable insert result.
 */
export interface MockInsertResult<T = unknown> {
  values: Mock<(data: T | T[]) => Promise<{ id: string }>>
  returning: Mock<() => Promise<T[]>>
  onConflictDoNothing: Mock<() => MockInsertResult<T>>
  onConflictDoUpdate: Mock<
    (config: { target: unknown; set: unknown }) => MockInsertResult<T>
  >
}

/**
 * Type for the chainable update result.
 */
export interface MockUpdateResult<T = unknown> {
  set: Mock<(data: Partial<T>) => MockUpdateSetResult>
}

/**
 * Type for the update.set result.
 */
export interface MockUpdateSetResult {
  where: Mock<(condition: unknown) => Promise<void>>
  returning: Mock<() => Promise<unknown[]>>
}

/**
 * Type for the chainable select result.
 */
export interface MockSelectResult<T = unknown> {
  from: Mock<(table: unknown) => MockSelectFromResult<T>>
}

/**
 * Type for the select.from result.
 */
export interface MockSelectFromResult<T = unknown> {
  where: Mock<(condition: unknown) => MockSelectWhereResult<T>>
  leftJoin: Mock<
    (table: unknown, condition: unknown) => MockSelectFromResult<T>
  >
  innerJoin: Mock<
    (table: unknown, condition: unknown) => MockSelectFromResult<T>
  >
  orderBy: Mock<(...columns: unknown[]) => MockSelectFromResult<T>>
  limit: Mock<(n: number) => MockSelectFromResult<T>>
  offset: Mock<(n: number) => MockSelectFromResult<T>>
  then: Mock<(resolve: (value: T[]) => void) => Promise<T[]>>
}

/**
 * Type for the select.from.where result.
 */
export interface MockSelectWhereResult<T = unknown> {
  then: Mock<(resolve: (value: T[]) => void) => Promise<T[]>>
  leftJoin: Mock<
    (table: unknown, condition: unknown) => MockSelectWhereResult<T>
  >
  innerJoin: Mock<
    (table: unknown, condition: unknown) => MockSelectWhereResult<T>
  >
  orderBy: Mock<(...columns: unknown[]) => MockSelectWhereResult<T>>
  limit: Mock<(n: number) => MockSelectWhereResult<T>>
  offset: Mock<(n: number) => MockSelectWhereResult<T>>
}

/**
 * Type for the chainable delete result.
 */
export interface MockDeleteResult {
  where: Mock<(condition: unknown) => Promise<void>>
}

/**
 * Interface for the complete mock database operations.
 */
export interface MockDbOperations {
  insert: Mock<(table: unknown) => MockInsertResult>
  update: Mock<(table: unknown) => MockUpdateResult>
  select: Mock<(columns?: unknown) => MockSelectResult>
  delete: Mock<(table: unknown) => MockDeleteResult>
  transaction: Mock<<T>(fn: (tx: MockDbOperations) => Promise<T>) => Promise<T>>
}

/**
 * Options for creating mock database operations.
 */
export interface CreateMockDbOptions {
  /**
   * Default data to return from select queries.
   */
  defaultSelectData?: unknown[]

  /**
   * Default ID to return from insert operations.
   */
  defaultInsertId?: string
}

/**
 * Creates type-safe mock database operations for testing.
 *
 * @param options - Configuration options for the mock
 * @returns A mock database operations object
 *
 * @example
 * ```typescript
 * const dbOps = createMockDbOperations({
 *   defaultSelectData: [{ id: '1', name: 'Test' }],
 *   defaultInsertId: 'new-id',
 * })
 *
 * // The mocks are chainable just like real Drizzle
 * await dbOps.insert(users).values({ name: 'Test' })
 * await dbOps.select().from(users).where(eq(users.id, '1'))
 * ```
 */
export function createMockDbOperations(
  options: CreateMockDbOptions = {},
): MockDbOperations {
  const { defaultSelectData = [], defaultInsertId = 'mock-id' } = options

  const createMockSelectWhereResult = <T>(
    data: T[] = defaultSelectData as T[],
  ): MockSelectWhereResult<T> => {
    const result: MockSelectWhereResult<T> = {
      then: mock((resolve) => {
        resolve(data)
        return Promise.resolve(data)
      }),
      leftJoin: mock(() => result),
      innerJoin: mock(() => result),
      orderBy: mock(() => result),
      limit: mock(() => result),
      offset: mock(() => result),
    }
    return result
  }

  const createMockSelectFromResult = <T>(
    data: T[] = defaultSelectData as T[],
  ): MockSelectFromResult<T> => {
    const whereResult = createMockSelectWhereResult(data)
    const result: MockSelectFromResult<T> = {
      where: mock(() => whereResult),
      leftJoin: mock(() => result),
      innerJoin: mock(() => result),
      orderBy: mock(() => result),
      limit: mock(() => result),
      offset: mock(() => result),
      then: mock((resolve) => {
        resolve(data)
        return Promise.resolve(data)
      }),
    }
    return result
  }

  const createMockInsertResult = <T>(): MockInsertResult<T> => {
    const result: MockInsertResult<T> = {
      values: mock(() => Promise.resolve({ id: defaultInsertId })),
      returning: mock(() => Promise.resolve([])),
      onConflictDoNothing: mock(() => result),
      onConflictDoUpdate: mock(() => result),
    }
    return result
  }

  const createMockUpdateSetResult = (): MockUpdateSetResult => ({
    where: mock(() => Promise.resolve()),
    returning: mock(() => Promise.resolve([])),
  })

  const createMockUpdateResult = <T>(): MockUpdateResult<T> => ({
    set: mock(() => createMockUpdateSetResult()),
  })

  const createMockDeleteResult = (): MockDeleteResult => ({
    where: mock(() => Promise.resolve()),
  })

  const dbOps: MockDbOperations = {
    insert: mock(() => createMockInsertResult()),
    update: mock(() => createMockUpdateResult()),
    select: mock(() => ({
      from: mock(() => createMockSelectFromResult()),
    })),
    delete: mock(() => createMockDeleteResult()),
    transaction: mock(async (fn) => fn(dbOps)),
  }

  return dbOps
}

/**
 * Result of setting up database spies.
 */
export interface DbSpies {
  /** Spy on insert operations */
  insert: ReturnType<typeof spyOn>
  /** Spy on update operations */
  update: ReturnType<typeof spyOn>
  /** Restore all spies */
  restore: () => void
  /** Clear all spy call history */
  clear: () => void
}

/**
 * Sets up spies on a database module for insert and update operations.
 * This is the most common pattern used in tests.
 *
 * @param db - The database module to spy on
 * @param options - Configuration options
 * @returns Object containing the spies and cleanup utilities
 *
 * @example
 * ```typescript
 * import db from '@codebuff/internal/db'
 *
 * describe('my test', () => {
 *   let dbSpies: DbSpies
 *
 *   beforeEach(() => {
 *     dbSpies = setupDbSpies(db)
 *   })
 *
 *   afterEach(() => {
 *     dbSpies.restore()
 *   })
 *
 *   it('inserts data', async () => {
 *     await createUser({ name: 'Test' })
 *     expect(dbSpies.insert).toHaveBeenCalled()
 *   })
 * })
 * ```
 */

/**
 * Sets up spies on a database module for insert and update operations.
 * Accepts any object with insert and update methods.
 */
export function setupDbSpies(
  db: { insert: unknown; update: unknown },
  options: CreateMockDbOptions = {},
): DbSpies {
  const { defaultInsertId = 'test-run-id' } = options

  const mockInsertResult = {
    values: mock(() => Promise.resolve({ id: defaultInsertId })),
  }

  const mockUpdateResult = {
    set: mock(() => ({
      where: mock(() => Promise.resolve()),
    })),
  }

  // Cast db to a spyable type - the actual db module has complex types that
  // don't play well with spyOn's inference, but the spy still works at runtime
  const spyableDb = db as { insert: () => unknown; update: () => unknown }
  const insertSpy = spyOn(spyableDb, 'insert').mockReturnValue(mockInsertResult)
  const updateSpy = spyOn(spyableDb, 'update').mockReturnValue(mockUpdateResult)

  return {
    insert: insertSpy,
    update: updateSpy,
    restore: () => {
      insertSpy.mockRestore()
      updateSpy.mockRestore()
    },
    clear: () => {
      insertSpy.mockClear()
      updateSpy.mockClear()
    },
  }
}

/**
 * Creates a mock for a database query builder chain that returns specific data.
 *
 * @param data - The data to return from the query
 * @returns A thenable mock that resolves to the data
 *
 * @example
 * ```typescript
 * const mockQuery = createMockQueryResult([
 *   { id: '1', name: 'User 1' },
 *   { id: '2', name: 'User 2' },
 * ])
 *
 * spyOn(userService, 'findAll').mockReturnValue(mockQuery)
 * ```
 */
export function createMockQueryResult<T>(data: T[]): Promise<T[]> & {
  where: Mock<() => Promise<T[]>>
  orderBy: Mock<() => Promise<T[]>>
  limit: Mock<() => Promise<T[]>>
} {
  const promise = Promise.resolve(data) as Promise<T[]> & {
    where: Mock<() => Promise<T[]>>
    orderBy: Mock<() => Promise<T[]>>
    limit: Mock<() => Promise<T[]>>
  }

  promise.where = mock(() => promise)
  promise.orderBy = mock(() => promise)
  promise.limit = mock(() => promise)

  return promise
}
