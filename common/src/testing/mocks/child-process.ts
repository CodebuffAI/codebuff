/** Typed child process mock for testing code that spawns processes. */

import { EventEmitter } from 'events'

import { mock } from 'bun:test'

import type { Mock } from 'bun:test'
import type { ChildProcess } from 'child_process'

/** Mock child process with typed stdout/stderr EventEmitters. */
export interface MockChildProcess extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  pid: number
  killed: boolean
  kill: Mock<(signal?: string) => boolean>
}

/** Creates a typed mock child process with EventEmitter-based stdout/stderr. */
export function createMockChildProcess(): MockChildProcess {
  const mockProcess = new EventEmitter() as MockChildProcess
  mockProcess.stdout = new EventEmitter()
  mockProcess.stderr = new EventEmitter()
  mockProcess.pid = Math.floor(Math.random() * 10000)
  mockProcess.killed = false
  mockProcess.kill = mock((signal?: string) => {
    mockProcess.killed = true
    mockProcess.emit('close', signal === 'SIGKILL' ? 137 : 0)
    return true
  })
  return mockProcess
}

/** Result type for code search tool output. */
export interface CodeSearchResult {
  stdout?: string
  stderr?: string
  message?: string
  errorMessage?: string
}

/** Typed accessor for code search result value. */
export function asCodeSearchResult(result: unknown): CodeSearchResult {
  if (
    result &&
    typeof result === 'object' &&
    'type' in result &&
    result.type === 'json' &&
    'value' in result
  ) {
    return result.value as CodeSearchResult
  }
  return {}
}

/** Creates a mock spawn function that returns the provided mock process. */
export function createMockSpawn(
  mockProcess: MockChildProcess,
): Mock<(command: string, args: string[], options?: object) => ChildProcess> {
  return mock(() => mockProcess as unknown as ChildProcess)
}

/** Helper to create ripgrep JSON match output. */
export function createRgJsonMatch(
  filePath: string,
  lineNumber: number,
  lineText: string,
): string {
  return JSON.stringify({
    type: 'match',
    data: {
      path: { text: filePath },
      lines: { text: lineText },
      line_number: lineNumber,
    },
  })
}

/** Helper to create ripgrep JSON context output (for -A, -B, -C flags). */
export function createRgJsonContext(
  filePath: string,
  lineNumber: number,
  lineText: string,
): string {
  return JSON.stringify({
    type: 'context',
    data: {
      path: { text: filePath },
      lines: { text: lineText },
      line_number: lineNumber,
    },
  })
}
