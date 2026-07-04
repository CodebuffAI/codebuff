import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import { createMockChildProcess } from '@codebuff/common/testing/mocks'
import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test'

import { gitBranch } from '../tools/git-branch'

import type { MockChildProcess } from '@codebuff/common/testing/mocks'

/**
 * Helper: creates a mock spawn that auto-responds to sequential `git` calls
 * based on the args. Uses `queueMicrotask` so listeners are attached before
 * events fire (runGit attaches stdout/stderr/close listeners synchronously
 * after spawn returns).
 */
function createSequencedMockSpawn(
  responses: Array<{
    matchArgs: (args: string[]) => boolean
    stdout?: string
    stderr?: string
    exitCode: number
  }>,
) {
  const procs: MockChildProcess[] = []
  const mockSpawn = mock((_cmd: string, args: string[]) => {
    const response = responses.find((r) => r.matchArgs(args))
    const proc = createMockChildProcess()
    procs.push(proc)
    queueMicrotask(() => {
      if (response) {
        if (response.stdout) {
          proc.stdout.emit('data', Buffer.from(response.stdout))
        }
        if (response.stderr) {
          proc.stderr.emit('data', Buffer.from(response.stderr))
        }
        proc.emit('close', response.exitCode)
      }
    })
    return proc as unknown as MockChildProcess
  })
  return { mockSpawn, procs }
}

describe('gitBranch', () => {
  let mockSpawn: ReturnType<typeof mock>

  beforeEach(() => {
    const { mockSpawn: spawn } = createSequencedMockSpawn([])
    mockSpawn = spawn
    void mockModule('child_process', () => ({
      spawn: mockSpawn,
    }))
  })

  afterEach(() => {
    mock.restore()
    clearMockedModules()
  })

  describe('dirty-tree refusal', () => {
    it('refuses to branch when working tree is dirty', async () => {
      const { mockSpawn: spawn } = createSequencedMockSpawn([
        {
          matchArgs: (a) => a[0] === 'status',
          stdout: '## main\n M file.ts\n',
          exitCode: 0,
        },
      ])
      await mockModule('child_process', () => ({ spawn }))

      const result = await gitBranch({
        cwd: '/test',
        branchName: 'feature-x',
      })

      expect(result.created).toBe(false)
      expect(result.switched).toBe(false)
      expect(result.errorMessage).toContain('Working tree is dirty')
      expect(result.errorMessage).toContain('M file.ts')
      // Only the status call should have been made — no checkout
      expect(spawn.mock.calls.length).toBe(1)
    })

    it('creates branch when working tree is clean', async () => {
      const { mockSpawn: spawn } = createSequencedMockSpawn([
        {
          matchArgs: (a) => a[0] === 'status',
          stdout: '## main\n',
          exitCode: 0,
        },
        {
          matchArgs: (a) => a[0] === 'rev-parse',
          stdout: 'main\n',
          exitCode: 0,
        },
        {
          matchArgs: (a) => a[0] === 'checkout',
          stdout: '',
          exitCode: 0,
        },
      ])
      await mockModule('child_process', () => ({ spawn }))

      const result = await gitBranch({
        cwd: '/test',
        branchName: 'feature-x',
      })

      expect(result.created).toBe(true)
      expect(result.switched).toBe(true)
      expect(result.branch).toBe('feature-x')
      expect(result.previousBranch).toBe('main')
      expect(result.errorMessage).toBeUndefined()
      expect(spawn.mock.calls.length).toBe(3)
    })

    it('allowDirty: true skips dirty-tree check', async () => {
      const { mockSpawn: spawn } = createSequencedMockSpawn([
        {
          matchArgs: (a) => a[0] === 'rev-parse',
          stdout: 'main\n',
          exitCode: 0,
        },
        {
          matchArgs: (a) => a[0] === 'checkout',
          stdout: '',
          exitCode: 0,
        },
      ])
      await mockModule('child_process', () => ({ spawn }))

      const result = await gitBranch({
        cwd: '/test',
        branchName: 'feature-x',
        allowDirty: true,
      })

      expect(result.created).toBe(true)
      expect(result.switched).toBe(true)
      // No status call — only rev-parse + checkout
      expect(spawn.mock.calls.length).toBe(2)
      const calls = spawn.mock.calls
      expect(calls[0][1][0]).toBe('rev-parse')
      expect(calls[1][1][0]).toBe('checkout')
    })
  })

  describe('switch behavior', () => {
    it('switch: false creates branch without switching (git branch, not checkout -b)', async () => {
      const { mockSpawn: spawn } = createSequencedMockSpawn([
        {
          matchArgs: (a) => a[0] === 'status',
          stdout: '## main\n',
          exitCode: 0,
        },
        {
          matchArgs: (a) => a[0] === 'branch',
          stdout: '',
          exitCode: 0,
        },
      ])
      await mockModule('child_process', () => ({ spawn }))

      const result = await gitBranch({
        cwd: '/test',
        branchName: 'feature-x',
        switch: false,
      })

      expect(result.created).toBe(true)
      expect(result.switched).toBe(false)
      expect(result.previousBranch).toBeUndefined()
      // No rev-parse call (only needed when switching)
      expect(spawn.mock.calls.length).toBe(2)
      const calls = spawn.mock.calls
      expect(calls[0][1][0]).toBe('status')
      expect(calls[1][1][0]).toBe('branch')
    })
  })

  describe('validation', () => {
    it('rejects empty branch name without spawning git', async () => {
      const result = await gitBranch({
        cwd: '/test',
        branchName: '',
      })

      expect(result.created).toBe(false)
      expect(result.errorMessage).toContain('Invalid branch name')
      expect(mockSpawn.mock.calls.length).toBe(0)
    })

    it('rejects branch name with spaces', async () => {
      const result = await gitBranch({
        cwd: '/test',
        branchName: 'bad name',
      })

      expect(result.created).toBe(false)
      expect(result.errorMessage).toContain('Invalid branch name')
      expect(mockSpawn.mock.calls.length).toBe(0)
    })

    it('rejects branch name starting with a dot', async () => {
      const result = await gitBranch({
        cwd: '/test',
        branchName: '.hidden',
      })

      expect(result.created).toBe(false)
      expect(result.errorMessage).toContain('Invalid branch name')
      expect(mockSpawn.mock.calls.length).toBe(0)
    })
  })

  describe('error propagation', () => {
    it('surfaces git_status error as errorMessage', async () => {
      const { mockSpawn: spawn } = createSequencedMockSpawn([
        {
          matchArgs: (a) => a[0] === 'status',
          stderr: 'fatal: not a git repository',
          exitCode: 128,
        },
      ])
      await mockModule('child_process', () => ({ spawn }))

      const result = await gitBranch({
        cwd: '/test',
        branchName: 'feature-x',
      })

      expect(result.created).toBe(false)
      expect(result.errorMessage).toContain('git_status error')
      expect(result.errorMessage).toContain('fatal: not a git repository')
    })

    it('surfaces git checkout failure as errorMessage', async () => {
      const { mockSpawn: spawn } = createSequencedMockSpawn([
        {
          matchArgs: (a) => a[0] === 'status',
          stdout: '## main\n',
          exitCode: 0,
        },
        {
          matchArgs: (a) => a[0] === 'rev-parse',
          stdout: 'main\n',
          exitCode: 0,
        },
        {
          matchArgs: (a) => a[0] === 'checkout',
          stderr: "fatal: a branch named 'feature-x' already exists",
          exitCode: 128,
        },
      ])
      await mockModule('child_process', () => ({ spawn }))

      const result = await gitBranch({
        cwd: '/test',
        branchName: 'feature-x',
      })

      expect(result.created).toBe(false)
      expect(result.errorMessage).toContain('already exists')
    })

    it('surfaces git branch failure (switch: false) as errorMessage', async () => {
      const { mockSpawn: spawn } = createSequencedMockSpawn([
        {
          matchArgs: (a) => a[0] === 'status',
          stdout: '## main\n',
          exitCode: 0,
        },
        {
          matchArgs: (a) => a[0] === 'branch',
          stderr: 'fatal: bad config',
          exitCode: 128,
        },
      ])
      await mockModule('child_process', () => ({ spawn }))

      const result = await gitBranch({
        cwd: '/test',
        branchName: 'feature-x',
        switch: false,
      })

      expect(result.created).toBe(false)
      expect(result.errorMessage).toContain('bad config')
    })
  })

  // Dispatch-path coverage: the SDK `handleToolCall` dispatch in `sdk/src/run.ts`
  // receives snake_case input from the Zod schema
  // (`common/src/tools/params/tool/git-branch.ts` exposes `branch_name` /
  // `switch` / `allow_dirty`) and must map it to the camelCase params
  // `gitBranch()` expects (`branchName` / `switch` / `allowDirty`). Before the
  // fix, the dispatch spread `...gitBranchInput` verbatim, so `branchName` was
  // `undefined` and EVERY dispatch-path call failed the name regex. These tests
  // exercise the exact mapping the dispatch performs and assert `gitBranch`
  // receives the correct camelCase values — covering the gap that let the
  // mismatch ship.
  describe('dispatch path snake→camel mapping (sdk/src/run.ts git_branch case)', () => {
    // Mirrors the mapping in sdk/src/run.ts `toolName === 'git_branch'` branch.
    function mapDispatchInput(input: {
      branch_name: string
      switch?: boolean
      allow_dirty?: boolean
    }): Parameters<typeof gitBranch>[0] {
      return {
        cwd: '/test',
        branchName: input.branch_name,
        switch: input.switch,
        allowDirty: input.allow_dirty,
      }
    }

    it('maps branch_name → branchName so gitBranch sees the typed name', async () => {
      const { mockSpawn: spawn } = createSequencedMockSpawn([
        {
          matchArgs: (a) => a[0] === 'status',
          stdout: '## main\n',
          exitCode: 0,
        },
        {
          matchArgs: (a) => a[0] === 'rev-parse',
          stdout: 'main\n',
          exitCode: 0,
        },
        {
          matchArgs: (a) => a[0] === 'checkout',
          stdout: '',
          exitCode: 0,
        },
      ])
      await mockModule('child_process', () => ({ spawn }))

      // Dispatch receives snake_case; the mapping must produce camelCase.
      const dispatchInput = {
        branch_name: 'feat/dispatch-path',
        switch: true,
        allow_dirty: false,
      }
      const result = await gitBranch(mapDispatchInput(dispatchInput))

      expect(result.created).toBe(true)
      expect(result.switched).toBe(true)
      expect(result.branch).toBe('feat/dispatch-path')
      expect(result.previousBranch).toBe('main')
      expect(result.errorMessage).toBeUndefined()
      // The checkout call must carry the mapped branchName, proving the mapping
      // preserved the value end-to-end through the dispatch → gitBranch path.
      const checkoutCall = spawn.mock.calls.find(
        (c) => c[1][0] === 'checkout',
      )
      expect(checkoutCall).toBeDefined()
      expect(checkoutCall![1]).toContain('-b')
      expect(checkoutCall![1]).toContain('feat/dispatch-path')
    })

    it('maps allow_dirty: true → allowDirty: true (not silently dropped)', async () => {
      const { mockSpawn: spawn } = createSequencedMockSpawn([
        {
          matchArgs: (a) => a[0] === 'rev-parse',
          stdout: 'main\n',
          exitCode: 0,
        },
        {
          matchArgs: (a) => a[0] === 'checkout',
          stdout: '',
          exitCode: 0,
        },
      ])
      await mockModule('child_process', () => ({ spawn }))

      const dispatchInput = {
        branch_name: 'feat/allow-dirty',
        switch: true,
        allow_dirty: true,
      }
      const result = await gitBranch(mapDispatchInput(dispatchInput))

      expect(result.created).toBe(true)
      expect(result.switched).toBe(true)
      // allowDirty: true skips the status call — only rev-parse + checkout fire.
      // If allow_dirty were silently dropped (forced to false), a `git status`
      // call would appear first and this assertion would fail.
      expect(spawn.mock.calls.length).toBe(2)
      const firstArgs = spawn.mock.calls[0][1]
      expect(firstArgs[0]).toBe('rev-parse')
      const secondArgs = spawn.mock.calls[1][1]
      expect(secondArgs[0]).toBe('checkout')
    })

    it('maps switch: false → switch: false (creates without checking out)', async () => {
      const { mockSpawn: spawn } = createSequencedMockSpawn([
        {
          matchArgs: (a) => a[0] === 'status',
          stdout: '## main\n',
          exitCode: 0,
        },
        {
          matchArgs: (a) => a[0] === 'branch',
          stdout: '',
          exitCode: 0,
        },
      ])
      await mockModule('child_process', () => ({ spawn }))

      const dispatchInput = {
        branch_name: 'feat/no-switch',
        switch: false,
        allow_dirty: false,
      }
      const result = await gitBranch(mapDispatchInput(dispatchInput))

      expect(result.created).toBe(true)
      expect(result.switched).toBe(false)
      expect(result.branch).toBe('feat/no-switch')
      // switch: false → `git branch <name>` (NOT `git checkout -b`).
      const branchCall = spawn.mock.calls.find((c) => c[1][0] === 'branch')
      expect(branchCall).toBeDefined()
      expect(branchCall![1]).not.toContain('-b')
      expect(branchCall![1]).toContain('feat/no-switch')
      // No checkout should fire when switch: false.
      const checkoutCall = spawn.mock.calls.find((c) => c[1][0] === 'checkout')
      expect(checkoutCall).toBeUndefined()
      // No rev-parse either (that only runs when switching).
      const revParseCall = spawn.mock.calls.find(
        (c) => c[1][0] === 'rev-parse',
      )
      expect(revParseCall).toBeUndefined()
    })
  })
})
