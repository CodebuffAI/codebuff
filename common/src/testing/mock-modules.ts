import { mock } from 'bun:test'

export type MockResult = {
  clear: () => void
}

let mockModuleCache: Record<string, MockResult> = {}

/**
 * Mocks a module by applying bun's mock.module() directly.
 *
 * Unlike the previous implementation, this does NOT eagerly import the original
 * module first. Eagerly importing modules that have side effects (like env
 * validation or DB client creation) causes "cannot access X before initialization"
 * temporal dead zone (TDZ) errors when circular dependencies exist, and triggers
 * environment variable validation failures when env vars are missing.
 *
 * @param modulePath - the module path to mock (e.g. '@codebuff/internal/db')
 * @param renderMocks - function returning the mock exports object
 */
export async function mockModule(
  modulePath: string,
  renderMocks: () => Record<string, any>,
): Promise<MockResult> {
  let mocks = renderMocks()
  mock.module(modulePath, () => mocks)
  let num = 0
  let key = modulePath
  while (key in mockModuleCache) {
    num++
    key = `${modulePath}\n${num}`
  }
  const mocked: MockResult = {
    clear: () => {
      delete mockModuleCache[key]
    },
  }
  mockModuleCache[key] = mocked
  return mocked
}

export const clearMockedModules = () => {
  Object.values(mockModuleCache).forEach((mockResult) => mockResult.clear())
  mockModuleCache = {}
}
