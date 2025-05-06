import { jest } from '@jest/globals'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { rgPath } from '@vscode/ripgrep'
import { FileChangeSchema } from 'common/actions'
import { applyChanges } from 'common/util/changes'
import { ToolExecutor } from '../executor'

// Mock dependencies
jest.mock('child_process')
jest.mock('fs')
jest.mock('@vscode/ripgrep')
jest.mock('common/util/changes')

describe('ToolExecutor', () => {
  const mockProjectRoot = '/test/project'
  let executor: ToolExecutor

  beforeEach(() => {
    executor = new ToolExecutor(mockProjectRoot)
    jest.clearAllMocks()
  })

  describe('write_file', () => {
    it('handles file creation successfully', async () => {
      const mockChange = {
        type: 'file' as const,
        path: 'test.ts',
        content: 'console.log("test");'
      }

      // Mock applyChanges to simulate file creation
      ;(applyChanges as jest.Mock).mockReturnValue({
        created: ['test.ts'],
        modified: [],
        ignored: []
      })

      const result = await executor.execute({
        id: '123',
        name: 'write_file',
        parameters: mockChange
      })

      expect(applyChanges).toHaveBeenCalledWith(mockProjectRoot, [mockChange])
      expect(result.result).toContain('Wrote to test.ts successfully')
    })

    it('handles file modification successfully', async () => {
      const mockChange = {
        type: 'file' as const,
        path: 'test.ts',
        content: 'console.log("test");'
      }

      // Mock applyChanges to simulate file modification
      ;(applyChanges as jest.Mock).mockReturnValue({
        created: [],
        modified: ['test.ts'],
        ignored: []
      })

      const result = await executor.execute({
        id: '123',
        name: 'write_file',
        parameters: mockChange
      })

      expect(applyChanges).toHaveBeenCalledWith(mockProjectRoot, [mockChange])
      expect(result.result).toContain('Wrote to test.ts successfully')
    })

    it('handles ignored files', async () => {
      const mockChange = {
        type: 'file' as const,
        path: '.gitignored/test.ts',
        content: 'console.log("test");'
      }

      // Mock applyChanges to simulate ignored file
      ;(applyChanges as jest.Mock).mockReturnValue({
        created: [],
        modified: [],
        ignored: ['.gitignored/test.ts']
      })

      const result = await executor.execute({
        id: '123',
        name: 'write_file',
        parameters: mockChange
      })

      expect(applyChanges).toHaveBeenCalledWith(mockProjectRoot, [mockChange])
      expect(result.result).toContain('Failed to write to .gitignored/test.ts')
    })
  })

  describe('run_terminal_command', () => {
    it('executes command and returns output', async () => {
      const mockSpawn = spawn as jest.MockedFunction<typeof spawn>
      const mockChildProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      }
      mockSpawn.mockReturnValue(mockChildProcess as any)

      // Set up event handlers
      let stdoutCallback: (data: Buffer) => void
      let stderrCallback: (data: Buffer) => void
      let closeCallback: (code: number) => void

      mockChildProcess.stdout.on.mockImplementation((event, cb) => {
        if (event === 'data') stdoutCallback = cb
      })
      mockChildProcess.stderr.on.mockImplementation((event, cb) => {
        if (event === 'data') stderrCallback = cb
      })
      mockChildProcess.on.mockImplementation((event, cb) => {
        if (event === 'close') closeCallback = cb
      })

      const resultPromise = executor.execute({
        id: '123',
        name: 'run_terminal_command',
        parameters: {
          command: 'echo "test"'
        }
      })

      // Simulate command output
      stdoutCallback(Buffer.from('test output'))
      stderrCallback(Buffer.from('test error'))
      closeCallback(0)

      const result = await resultPromise

      expect(mockSpawn).toHaveBeenCalledWith('echo "test"', {
        cwd: mockProjectRoot,
        shell: true
      })
      expect(result.result).toContain('test output')
      expect(result.result).toContain('test error')
    })

    it('handles command timeout', async () => {
      jest.useFakeTimers()
      const mockSpawn = spawn as jest.MockedFunction<typeof spawn>
      const mockChildProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      }
      mockSpawn.mockReturnValue(mockChildProcess as any)

      const resultPromise = executor.execute({
        id: '123',
        name: 'run_terminal_command',
        parameters: {
          command: 'sleep 100',
          timeout_seconds: 1
        }
      })

      // Fast-forward time to trigger timeout
      jest.advanceTimersByTime(1000)

      await expect(resultPromise).rejects.toThrow('Command timed out')
      expect(mockChildProcess.kill).toHaveBeenCalled()

      jest.useRealTimers()
    })
  })

  describe('code_search', () => {
    it('executes ripgrep and returns results', async () => {
      const mockSpawn = spawn as jest.MockedFunction<typeof spawn>
      const mockChildProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      }
      mockSpawn.mockReturnValue(mockChildProcess as any)

      // Set up event handlers
      let stdoutCallback: (data: Buffer) => void
      let closeCallback: (code: number) => void

      mockChildProcess.stdout.on.mockImplementation((event, cb) => {
        if (event === 'data') stdoutCallback = cb
      })
      mockChildProcess.on.mockImplementation((event, cb) => {
        if (event === 'close') closeCallback = cb
      })

      const resultPromise = executor.execute({
        id: '123',
        name: 'code_search',
        parameters: {
          pattern: 'test'
        }
      })

      // Simulate search results
      stdoutCallback(Buffer.from('file1.ts:1:test\nfile2.ts:2:test'))
      closeCallback(0)

      const result = await resultPromise

      expect(mockSpawn).toHaveBeenCalledWith(expect.stringContaining('test'), {
        cwd: mockProjectRoot,
        shell: true
      })
      expect(result.result).toContain('file1.ts:1:test')
      expect(result.result).toContain('file2.ts:2:test')
    })

    it('handles ripgrep errors', async () => {
      const mockSpawn = spawn as jest.MockedFunction<typeof spawn>
      const mockChildProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      }
      mockSpawn.mockReturnValue(mockChildProcess as any)

      // Set up event handlers
      let errorCallback: (error: Error) => void
      mockChildProcess.on.mockImplementation((event, cb) => {
        if (event === 'error') errorCallback = cb
      })

      const resultPromise = executor.execute({
        id: '123',
        name: 'code_search',
        parameters: {
          pattern: 'test'
        }
      })

      // Simulate error
      errorCallback(new Error('ripgrep failed'))

      const result = await resultPromise

      expect(result.result).toContain('Failed to execute ripgrep')
    })
  })
})