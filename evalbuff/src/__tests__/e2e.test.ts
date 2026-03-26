/**
 * E2E test for evalbuff.
 *
 * This test runs the full evalbuff loop with a real (mock) agent on a local
 * git repo with synthetic eval tasks. It verifies:
 * - The morning report is generated
 * - Log entries are written
 * - State file tracks completed tasks
 * - Doc edits are committed to the repo when they improve scores
 *
 * This test uses mock.module to replace LLM calls but runs the full
 * orchestrator, CLI runner, and git operations for real.
 *
 * Run: bun test evalbuff/src/__tests__/e2e.test.ts
 */
import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test'

import type { JudgingResult } from '../judge'
import type { DocSuggestion } from '../docs-optimizer'
import type { EvalDataV2 } from '../types'

// --- Mocks for LLM calls only ---

let judgeCallCount = 0

mock.module('../test-repo-utils', () => ({
  withTestRepo: async (_config: any, fn: (cwd: string) => Promise<any>) => {
    // Create a real local git repo for each call
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalbuff-e2e-repo-'))
    execSync('git init && git add . && git commit --allow-empty -m "init"', {
      cwd: dir,
      stdio: 'ignore',
      env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@test.com' },
    })
    try {
      return await fn(dir)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  },
}))

// Judge returns alternating scores: low (triggers doc edit), then higher (confirms improvement)
mock.module('../judge', () => ({
  judgeCommitResult: async () => {
    const scores = [3.0, 6.0, 8.5, 5.0, 7.0, 9.0]
    const score = scores[judgeCallCount % scores.length]
    judgeCallCount++
    return {
      analysis: `Mock analysis for call ${judgeCallCount}`,
      strengths: ['Correctly identified the problem'],
      weaknesses: ['Missing error handling', 'No tests added'],
      e2eTestsPerformed: ['Started dev server', 'Tested API endpoint'],
      completionScore: score,
      codeQualityScore: score,
      e2eScore: score,
      overallScore: score,
    } satisfies JudgingResult
  },
}))

const actualDocsOptimizer = await import('../docs-optimizer')
mock.module('../docs-optimizer', () => ({
  ...actualDocsOptimizer,
  analyzeFailure: async () =>
    ({
      reasoning: 'Agent consistently misses error handling patterns in async code',
      suggestedDocPath: 'patterns/async-error-handling.md',
      suggestedContent:
        '# Async Error Handling\n\nAll async functions should use try/catch blocks.\nPropagate errors with meaningful messages.\n\n## Examples\n\n```ts\nasync function fetchData() {\n  try {\n    const result = await api.get("/data")\n    return result\n  } catch (error) {\n    throw new Error(`Failed to fetch data: ${error.message}`)\n  }\n}\n```\n',
    }) satisfies DocSuggestion,
}))

mock.module('@codebuff/sdk', () => ({
  CodebuffClient: class {
    constructor() {}
  },
}))

const { runEvalbuff } = await import('../run-evalbuff')

// --- Test setup ---

let repoDir: string
let evalFilePath: string

beforeAll(() => {
  // Create a "target repo" where docs will be written
  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalbuff-e2e-target-'))
  execSync('git init && git add . && git commit --allow-empty -m "init"', {
    cwd: repoDir,
    stdio: 'ignore',
    env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@test.com' },
  })

  // Create eval file with 3 tasks
  const evalData: EvalDataV2 = {
    repoUrl: 'https://github.com/test/repo',
    generationDate: '2026-03-25',
    evalCommits: [
      {
        id: 'e2e-task-1',
        sha: 'aaa111',
        parentSha: 'aaa000',
        spec: 'Add error handling to fetchData',
        prompt: 'Add try/catch error handling to the fetchData function in src/api.ts',
        supplementalFiles: [],
        fileDiffs: [
          {
            path: 'src/api.ts',
            status: 'modified',
            diff: '@@ -5,3 +5,7 @@\n-const data = await fetch(url)\n+try {\n+  const data = await fetch(url)\n+} catch (e) {\n+  throw new Error(`Fetch failed: ${e.message}`)\n+}',
          },
        ],
      },
      {
        id: 'e2e-task-2',
        sha: 'bbb222',
        parentSha: 'bbb000',
        spec: 'Add input validation',
        prompt: 'Add input validation to the createUser endpoint',
        supplementalFiles: [],
        fileDiffs: [
          {
            path: 'src/routes/users.ts',
            status: 'modified',
            diff: '@@ -1 +1,5 @@\n+if (!name || !email) {\n+  throw new Error("name and email required")\n+}',
          },
        ],
      },
      {
        id: 'e2e-task-3',
        sha: 'ccc333',
        parentSha: 'ccc000',
        spec: 'Refactor logger',
        prompt: 'Refactor the logger to use structured JSON output',
        supplementalFiles: [],
        fileDiffs: [
          {
            path: 'src/logger.ts',
            status: 'modified',
            diff: '@@ -1 +1,3 @@\n-console.log(msg)\n+const entry = { timestamp: Date.now(), message: msg }\n+process.stdout.write(JSON.stringify(entry) + "\\n")',
          },
        ],
      },
    ],
  }

  evalFilePath = path.join(repoDir, 'eval-e2e.json')
  fs.writeFileSync(evalFilePath, JSON.stringify(evalData))

  judgeCallCount = 0
})

afterAll(() => {
  fs.rmSync(repoDir, { recursive: true, force: true })
})

// --- E2E tests ---

describe('evalbuff E2E', () => {
  it('runs full loop: agent, judge, doc edit, morning report', async () => {
    await runEvalbuff({
      repoPath: repoDir,
      agentCommand: 'echo', // echo just prints the prompt and exits
      evalDataPaths: [evalFilePath],
      maxIterations: 3,
      maxCostUsd: 50,
      scoreThreshold: 7.0,
      agentTimeoutMs: 10_000,
    })

    // 1. Morning report exists
    const reportFiles = fs
      .readdirSync(repoDir)
      .filter((f) => f.startsWith('evalbuff-report-'))
    expect(reportFiles.length).toBe(1)
    const report = fs.readFileSync(
      path.join(repoDir, reportFiles[0]),
      'utf-8',
    )
    expect(report).toContain('# Evalbuff Morning Report')
    expect(report).toContain('Iterations | 3')

    // 2. Log has 3 entries
    const logPath = path.join(repoDir, 'evalbuff-log.jsonl')
    expect(fs.existsSync(logPath)).toBe(true)
    const logLines = fs
      .readFileSync(logPath, 'utf-8')
      .trim()
      .split('\n')
    expect(logLines).toHaveLength(3)

    // 3. State tracks all 3 completed tasks
    const statePath = path.join(repoDir, 'evalbuff-state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(state.completedTaskIds).toEqual([
      'e2e-task-1',
      'e2e-task-2',
      'e2e-task-3',
    ])

    // 4. At least one doc was written (first task scores 3.0, below threshold)
    const docsDir = path.join(repoDir, 'docs')
    expect(fs.existsSync(docsDir)).toBe(true)

    // 5. AGENTS.md was created with TOC
    const agentsMdPath = path.join(repoDir, 'AGENTS.md')
    expect(fs.existsSync(agentsMdPath)).toBe(true)
    const agentsMd = fs.readFileSync(agentsMdPath, 'utf-8')
    expect(agentsMd).toContain('async-error-handling.md')

    // 6. Doc edits were committed to git
    const gitLog = execSync('git log --oneline', {
      cwd: repoDir,
      encoding: 'utf-8',
    })
    expect(gitLog).toContain('evalbuff:')

    // 7. Log entries have correct task IDs
    const parsedEntries = logLines.map((l) => JSON.parse(l))
    expect(parsedEntries.map((e: any) => e.taskId)).toEqual([
      'e2e-task-1',
      'e2e-task-2',
      'e2e-task-3',
    ])
  })
})
