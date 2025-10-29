import { mock } from 'bun:test'

export type MockResult = {
  clear: () => void
}

const originalModuleCache: Record<string, any> = {}
let mockModuleCache: Record<string, MockResult> = {}

/**
 *
 * @param modulePath - the path starting from this files' path.
 * @param renderMocks - function to generate mocks (by their named or default exports)
 * @returns an object
 */
export async function mockModule(
  modulePath: string,
  renderMocks: () => Record<string, any>,
): Promise<MockResult> {
  let original = originalModuleCache[modulePath] ?? {
    ...(await import(modulePath)),
  }
  originalModuleCache[modulePath] = original
  let mocks = renderMocks()
  let result = {
    ...original,
    ...mocks,
  }
  mock.module(modulePath, () => result)
  let num = 0
  let key = modulePath
  while (key in mockModuleCache) {
    num++
    key = `${modulePath}\n${num}`
  }
  const mocked: MockResult = {
    clear: () => {
      mock.module(modulePath, () => original)
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
