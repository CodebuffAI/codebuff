/**
 * E2E test for evalbuff.
 *
 * This test runs the full evalbuff loop with mocked LLM calls but real
 * orchestration. It verifies:
 * - The morning report is generated
 * - Log entries are written
 * - State file tracks processed commits
 * - Doc edits are committed to the repo when they improve scores
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

// --- Mocks for LLM calls only ---

let judgeCallCount = 0

mock.module('../test-repo-utils', () => ({
  withTestRepo: async (_config: any, fn: (cwd: string) => Promise<any>) => {
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

mock.module('../runners/codebuff', () => ({
  CodebuffRunner: class {
    constructor() {}
    async run() {
      return {
        steps: [{ type: 'text', content: 'mock trace' }],
        totalCostUsd: 0.01,
        diff: 'mock diff content',
      }
    }
  },
}))

mock.module('@codebuff/sdk', () => ({
  CodebuffClient: class {
    constructor() {}
    async run() { return { output: { type: 'success' }, sessionState: null } }
  },
  loadLocalAgents: async () => ({}),
}))

// Judge returns alternating scores: low (triggers doc edit), then higher (confirms improvement)
mock.module('../judge', () => ({
  judgeTaskResult: async () => {
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
        '# Async Error Handling\n\nAll async functions should use try/catch blocks.\nPropagate errors with meaningful messages.\n',
    }) satisfies DocSuggestion,
}))

// Mock commit-task-generator
mock.module('../commit-task-generator', () => ({
  getCommitList: () => ['sha-1', 'sha-2', 'sha-3'],
  buildCommitTask: async (_repoPath: string, sha: string) => ({
    sha,
    parentSha: `parent-${sha}`,
    message: `Commit ${sha}`,
    prompt: `Do the thing for ${sha}`,
    diff: `mock diff for ${sha}`,
    filesChanged: ['src/file.ts'],
  }),
}))

const { runLearnMode } = await import('../run-evalbuff')

// --- Test setup ---

let repoDir: string

beforeAll(() => {
  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalbuff-e2e-target-'))
  execSync('git init && git add . && git commit --allow-empty -m "init"', {
    cwd: repoDir,
    stdio: 'ignore',
    env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@test.com' },
  })
  execSync('git remote add origin https://github.com/test/repo', {
    cwd: repoDir,
    stdio: 'ignore',
  })

  judgeCallCount = 0
})

afterAll(() => {
  fs.rmSync(repoDir, { recursive: true, force: true })
})

// --- E2E tests ---

describe('evalbuff E2E', () => {
  it('runs full learn loop: processes commits, improves docs, generates report', async () => {
    await runLearnMode({
      mode: 'learn',
      repoPath: repoDir,
      agentId: 'base2-free-evals',
      parallelism: 1,
      maxCostUsd: 50,
      agentTimeoutMs: 10_000,
      commitCount: 500,
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

    // 2. Log has entries
    const logPath = path.join(repoDir, 'evalbuff-log.jsonl')
    expect(fs.existsSync(logPath)).toBe(true)
    const logLines = fs
      .readFileSync(logPath, 'utf-8')
      .trim()
      .split('\n')
    expect(logLines.length).toBeGreaterThan(0)

    // 3. State tracks last processed commit
    const statePath = path.join(repoDir, 'evalbuff-state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(state.lastProcessedCommitSha).toBe('sha-3')
    expect(state.processedCommitCount).toBe(3)

    // 4. At least one doc was written (first task scores 3.0)
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
  })
})
