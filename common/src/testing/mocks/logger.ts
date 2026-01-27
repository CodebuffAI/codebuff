import { mock } from 'bun:test'

import type { Mock } from 'bun:test'

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export type LogMethod = (
  data: unknown,
  msg?: string,
  ...args: unknown[]
) => unknown

export type MockLogMethod = Mock<LogMethod>

export interface MockLogger {
  trace: MockLogMethod
  debug: MockLogMethod
  info: MockLogMethod
  warn: MockLogMethod
  error: MockLogMethod
  fatal: MockLogMethod
  child: Mock<(bindings: Record<string, unknown>) => MockLogger>
}

export interface CreateMockLoggerOptions {
  captureOutput?: boolean
  customImplementations?: Partial<Record<LogLevel, LogMethod>>
}

export interface CapturedLogEntry {
  level: LogLevel
  message: string
  meta?: Record<string, unknown>
  timestamp: Date
}

export function createMockLogger(
  options: CreateMockLoggerOptions = {},
): MockLogger {
  const { customImplementations = {} } = options

  const createLogMethod = (level: LogLevel): MockLogMethod => {
    const customImpl = customImplementations[level]
    if (customImpl) {
      return mock(customImpl)
    }
    return mock(() => {})
  }

  const mockLogger: MockLogger = {
    trace: createLogMethod('trace'),
    debug: createLogMethod('debug'),
    info: createLogMethod('info'),
    warn: createLogMethod('warn'),
    error: createLogMethod('error'),
    fatal: createLogMethod('fatal'),
    child: mock(() => createMockLogger(options)),
  }

  return mockLogger
}

export interface MockLoggerWithCapture {
  logger: MockLogger
  captured: CapturedLogEntry[]
  clearCaptured: () => void
  getByLevel: (level: LogLevel) => CapturedLogEntry[]
  getByMessage: (pattern: string | RegExp) => CapturedLogEntry[]
}

/** Creates a mock logger that captures all output for inspection. */
export function createMockLoggerWithCapture(): MockLoggerWithCapture {
  const captured: CapturedLogEntry[] = []

  const createCapturingLogMethod = (level: LogLevel): MockLogMethod => {
    return mock((data: unknown, msg?: string) => {
      const message = typeof data === 'string' ? data : (msg ?? String(data))
      const meta =
        typeof data === 'object' && data !== null
          ? (data as Record<string, unknown>)
          : undefined
      captured.push({
        level,
        message,
        meta,
        timestamp: new Date(),
      })
    })
  }

  const logger: MockLogger = {
    trace: createCapturingLogMethod('trace'),
    debug: createCapturingLogMethod('debug'),
    info: createCapturingLogMethod('info'),
    warn: createCapturingLogMethod('warn'),
    error: createCapturingLogMethod('error'),
    fatal: createCapturingLogMethod('fatal'),
    child: mock(() => createMockLoggerWithCapture().logger),
  }

  return {
    logger,
    captured,
    clearCaptured: () => {
      captured.length = 0
    },
    getByLevel: (level: LogLevel) => captured.filter((e) => e.level === level),
    getByMessage: (pattern: string | RegExp) =>
      captured.filter((e) =>
        typeof pattern === 'string'
          ? e.message.includes(pattern)
          : pattern.test(e.message),
      ),
  }
}

export function restoreMockLogger(logger: MockLogger): void {
  logger.trace.mockRestore()
  logger.debug.mockRestore()
  logger.info.mockRestore()
  logger.warn.mockRestore()
  logger.error.mockRestore()
  logger.fatal.mockRestore()
  logger.child.mockRestore()
}

export function clearMockLogger(logger: MockLogger): void {
  logger.trace.mockClear()
  logger.debug.mockClear()
  logger.info.mockClear()
  logger.warn.mockClear()
  logger.error.mockClear()
  logger.fatal.mockClear()
  logger.child.mockClear()
}
