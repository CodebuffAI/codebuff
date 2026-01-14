import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
  test,
} from '@jest/globals'

type MockFactory = <T extends (...args: any[]) => any>(
  impl?: T,
) => jest.Mock<ReturnType<T>, Parameters<T>>

const mock = ((impl?: (...args: any[]) => any) => jest.fn(impl)) as MockFactory & {
  restore: () => void
  clearAllMocks: () => void
  module: (moduleName: string, factory: () => unknown) => void
}

mock.restore = () => {
  jest.restoreAllMocks()
}

mock.clearAllMocks = () => {
  jest.clearAllMocks()
}

mock.module = (moduleName, factory) => {
  jest.mock(moduleName, factory)
}

export { afterEach, beforeEach, describe, expect, it, test, mock }
