import { execSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  runAgentOnCommit,
  runFinalCheckCommands,
  runWithTimeoutSignal,
} from '../agent-runner'
import { executeInitCommand } from '../setup-test-repo'
import { ClaudeRunner } from '../runners/claude'
import { isAbortError } from '../runners/runner'

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 2000
  while (!existsSync(path)) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${path}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('runWithTimeoutSignal', () => {
  test('normalizes synchronous operation failures into promise rejections', async () => {
    await expect(
      runWithTimeoutSignal(
        () => {
          throw new Error('runner setup failed')
        },
        1000,
        'runner timed out',
      ),
    ).rejects.toThrow('runner setup failed')
  })

  test('aborts the signal passed to the runner task on timeout', async () => {
    let observedSignal: AbortSignal | undefined
    let abortReason: unknown

    await expect(
      runWithTimeoutSignal(
        async (signal) => {
          observedSignal = signal
          return new Promise<never>((resolve) => {
            signal.addEventListener(
              'abort',
              () => {
                abortReason = signal.reason
              },
              { once: true },
            )
          })
        },
        1,
        'runner timed out',
      ),
    ).rejects.toThrow('runner timed out')

    expect(observedSignal).toBeDefined()
    expect(observedSignal!.aborted).toBe(true)
    expect(abortReason).toBeInstanceOf(Error)
    expect((abortReason as Error).message).toContain('runner timed out')
  })
})

describe('external runner abort handling', () => {
  test('classifies abort errors without treating startup messages as aborts', () => {
    expect(
      isAbortError(
        Object.assign(new Error('aborted by shell setup'), {
          code: 'ENOENT',
        }),
      ),
    ).toBe(false)
    expect(
      isAbortError(
        Object.assign(new Error('The operation was aborted'), {
          code: 'ABORT_ERR',
        }),
      ),
    ).toBe(true)
    expect(
      isAbortError({
        name: 'AbortError',
        message: 'The operation was aborted',
      }),
    ).toBe(true)
  })

  test('ClaudeRunner reports signal abort distinctly from startup failure', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'buffbench-claude-abort-'))
    try {
      const binDir = join(tmpRoot, 'bin')
      const markerPath = join(tmpRoot, 'git-cleanup-marker')
      const startedPath = join(tmpRoot, 'claude-started')
      writeFileSync(join(tmpRoot, 'package.json'), '{}\n')
      writeFileSync(join(tmpRoot, 'README.md'), 'test repo\n')
      writeFileSync(markerPath, 'unchanged\n')
      await Bun.$`git init`.cwd(tmpRoot).quiet()
      await Bun.$`git config user.email test@example.com`.cwd(tmpRoot).quiet()
      await Bun.$`git config user.name Test`.cwd(tmpRoot).quiet()
      await Bun.$`git add .`.cwd(tmpRoot).quiet()
      await Bun.$`git commit -m initial`.cwd(tmpRoot).quiet()
      writeFileSync(markerPath, 'dirty after commit\n')

      await Bun.$`mkdir -p ${binDir}`.quiet()
      const fakeClaudePath = join(binDir, 'claude')
      writeFileSync(
        fakeClaudePath,
        `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(startedPath)}, 'started\\n')\nsetInterval(() => {}, 1000)\n`,
      )
      chmodSync(fakeClaudePath, 0o755)

      const controller = new AbortController()
      const runner = new ClaudeRunner(tmpRoot, {
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
      })
      const runPromise = runner.run('abort me', { signal: controller.signal })

      await waitForFile(startedPath)
      controller.abort()

      await expect(runPromise).rejects.toThrow('Claude CLI run aborted')
      await expect(runPromise).rejects.not.toThrow('failed to start')
      const stagedMarker = await Bun.$`git diff --cached --name-only`
        .cwd(tmpRoot)
        .text()
      expect(stagedMarker).not.toContain('git-cleanup-marker')
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true })
    }
  })
})

describe('runAgentOnCommit', () => {
  test('computes cache recall eval and appends deterministic final-check output', async () => {
    const tmpRoot = mkdtempSync(
      join(tmpdir(), 'buffbench-cache-recall-runner-'),
    )

    try {
      writeFileSync(join(tmpRoot, 'README.md'), 'initial\n')
      await Bun.$`git init`.cwd(tmpRoot).quiet()
      await Bun.$`git config user.email test@example.com`.cwd(tmpRoot).quiet()
      await Bun.$`git config user.name Test`.cwd(tmpRoot).quiet()
      await Bun.$`git add .`.cwd(tmpRoot).quiet()
      await Bun.$`git commit -m initial`.cwd(tmpRoot).quiet()
      const parentSha = execSync('git rev-parse HEAD', {
        cwd: tmpRoot,
        encoding: 'utf-8',
      }).trim()

      const client = {
        run: async (input: { cwd: string }) => {
          writeFileSync(join(input.cwd, 'cache-result.txt'), 'changed\n')
          return {
            output: { type: 'text' as const, value: 'done' },
            sessionState: {
              mainAgentState: {
                creditsUsed: 25,
                cacheInputTokens: 750,
                cacheTotalInputTokens: 1000,
                messageHistory: [
                  {
                    role: 'assistant',
                    content:
                      '<knowledge_memory>Validated: typecheck clean</knowledge_memory>',
                  },
                ],
              },
            },
          }
        },
      }

      const result = await runAgentOnCommit({
        client: client as any,
        agentId: 'test-agent',
        commit: {
          id: 'cache-recall-task',
          sha: parentSha,
          parentSha,
          spec: 'Verify cache recall metrics.',
          prompt: 'write a file',
          supplementalFiles: [],
          fileDiffs: [],
        },
        repoUrl: tmpRoot,
        localAgentDefinitions: [],
        printEvents: false,
        cacheRecallEval: {
          minCacheHitRatio: 0.7,
          requiredRecallSubstrings: ['<knowledge_memory>', 'typecheck clean'],
        },
      })

      expect(result.error).toBeUndefined()
      expect(result.cacheRecallEval).toMatchObject({
        passed: true,
        cachedInputTokens: 750,
        inputTokens: 1000,
        cacheHitRatio: 0.75,
        cacheHitRatioPassed: true,
        recallPassed: true,
      })
      expect(result.finalCheckOutputs).toHaveLength(1)
      expect(result.finalCheckOutputs![0]).toMatchObject({
        command: 'buffbench cache-recall eval',
        exitCode: 0,
        stderr: '',
      })
      expect(JSON.parse(result.finalCheckOutputs![0]!.stdout)).toMatchObject({
        passed: true,
        cacheHitRatio: 0.75,
      })
      expect(result.diff).toContain('cache-result.txt')
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true })
    }
  })
})

describe('executeInitCommand', () => {
  test('runs initCommand with shell semantics from the repo root', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'buffbench-init-command-'))
    const outputPath = join(tmpRoot, 'init-output')

    try {
      executeInitCommand(
        `printf '%s' "hello quoted world" > ${JSON.stringify(outputPath)}`,
        tmpRoot,
      )

      await expect(Bun.file(outputPath).text()).resolves.toBe(
        'hello quoted world',
      )
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true })
    }
  })
})

describe('runFinalCheckCommands', () => {
  test('aborts an in-flight final check command and preserves output shape', async () => {
    const controller = new AbortController()
    const runPromise = runFinalCheckCommands(
      ['node -e "setTimeout(() => {}, 10000)"'],
      process.cwd(),
      undefined,
      controller.signal,
    )

    controller.abort()
    const [result] = await runPromise

    expect(result).toBeDefined()
    expect(result!.command).toContain('setTimeout')
    expect(result!.exitCode).toBe(1)
    expect(typeof result!.stdout).toBe('string')
    expect(result!.stderr.toLowerCase()).toContain('abort')
  })
})
