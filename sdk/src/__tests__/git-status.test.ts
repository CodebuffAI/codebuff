import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import { createMockChildProcess } from '@codebuff/common/testing/mocks'
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import { gitStatus } from '../tools/git-status'

import type { MockChildProcess } from '@codebuff/common/testing/mocks'

function getErrorMessage(result: Awaited<ReturnType<typeof gitStatus>>): string {
  const firstEntry = result[0]
  expect(firstEntry.type).toBe('json')
  const value = firstEntry.value as { errorMessage?: string }
  expect(value.errorMessage).toBeDefined()
  return value.errorMessage ?? ''
}

describe('gitStatus', () => {
  let mockSpawn: ReturnType<typeof mock>
  let mockProcess: MockChildProcess

  beforeEach(async () => {
    mockProcess = createMockChildProcess()
    mockSpawn = mock(() => mockProcess)
    await mockModule('child_process', () => ({
      spawn: mockSpawn,
    }))
  })

  afterEach(() => {
    mock.restore()
    clearMockedModules()
  })

  it('returns an error result when spawning git throws synchronously', async () => {
    mockSpawn = mock(() => {
      throw new Error('spawn failed')
    })
    await mockModule('child_process', () => ({
      spawn: mockSpawn,
    }))

    const result = await gitStatus({ cwd: '/test/project' })

    expect(getErrorMessage(result)).toContain('spawn failed')
    expect(mockSpawn).toHaveBeenCalledTimes(1)
  })

  describe('AbortSignal handling', () => {
    it('returns an error without spawning git when already aborted', async () => {
      const controller = new AbortController()
      controller.abort(new Error('caller cancelled'))

      const result = await gitStatus({
        cwd: '/test/project',
        signal: controller.signal,
      })

      expect(getErrorMessage(result)).toContain('caller cancelled')
      expect(mockSpawn).not.toHaveBeenCalled()
    })

    it('kills the git process and returns an error when aborted mid-flight', async () => {
      const controller = new AbortController()
      const statusPromise = gitStatus({
        cwd: '/test/project',
        signal: controller.signal,
      })

      expect(mockSpawn).toHaveBeenCalledTimes(1)
      controller.abort(new Error('stop git status'))

      const result = await statusPromise
      expect(getErrorMessage(result)).toContain('stop git status')
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM')
    })
  })
})
