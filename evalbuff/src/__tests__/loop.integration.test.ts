import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import type { JudgingResult } from '../judge'
import type { DocSuggestion } from '../docs-optimizer'

// --- Mocks ---

let judgeCallCount = 0
let judgeScores: number[] = []
let analyzeCallCount = 0
let analyzeFailureResults: Array<DocSuggestion | null> = []
let cliRunnerCallCount = 0

// Mock withTestRepo to use a local temp dir instead of cloning
mock.module('../test-repo-utils', () => ({
  withTestRepo: async (_config: any, fn: (cwd: string) => Promise<any>) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalbuff-mock-repo-'))
    execSync('git init && git add . && git commit --allow-empty -m "init"', {
      cwd: dir,
      stdio: 'ignore',
    })
    try {
      return await fn(dir)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  },
}))

// Mock CodebuffRunner to return a fake result
mock.module('../runners/codebuff', () => ({
  CodebuffRunner: class {
    constructor() {}
    async run() {
      cliRunnerCallCount++
      return {
        steps: [{ type: 'text', content: 'mock trace' }],
        totalCostUsd: 0.01,
        diff: 'mock diff content',
      }
    }
  },
}))

// Mock SDK client and loadLocalAgents
mock.module('@codebuff/sdk', () => ({
  CodebuffClient: class {
    constructor() {}
    async run() { return { output: { type: 'success' }, sessionState: null } }
  },
  loadLocalAgents: async () => ({}),
}))

// Mock judge to return configurable scores
mock.module('../judge', () => ({
  judgeTaskResult: async () => {
    const score = judgeScores[judgeCallCount] ?? 5.0
    judgeCallCount++
    return {
      analysis: 'Mock analysis',
      strengths: ['Good'],
      weaknesses: ['Could improve'],
      e2eTestsPerformed: ['Mock E2E test'],
      completionScore: score,
      codeQualityScore: score,
      e2eScore: score,
      overallScore: score,
    } satisfies JudgingResult
  },
  judgeCommitResult: async () => {
    const score = judgeScores[judgeCallCount] ?? 5.0
    judgeCallCount++
    return {
      analysis: 'Mock analysis',
      strengths: ['Good'],
      weaknesses: ['Could improve'],
      e2eTestsPerformed: ['Mock E2E test'],
      completionScore: score,
      codeQualityScore: score,
      e2eScore: score,
      overallScore: score,
    } satisfies JudgingResult
  },
}))

// Mock docs-optimizer LLM calls but keep pure functions
const actualDocsOptimizer = await import('../docs-optimizer')
mock.module('../docs-optimizer', () => ({
  ...actualDocsOptimizer,
  analyzeFailure: async () => {
    const result = analyzeFailureResults[analyzeCallCount] ?? null
    analyzeCallCount++
    return result
  },
}))

// Mock commit-task-generator to avoid real git and LLM calls
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

// Import after mocks are set up
const { runLearnMode, runPromptMode } = await import('../run-evalbuff')

// --- Test fixtures ---

let repoDir: string

beforeEach(() => {
  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalbuff-integ-'))
  execSync('git init && git add . && git commit --allow-empty -m "init"', {
    cwd: repoDir,
    stdio: 'ignore',
  })
  // Set up a fake remote so git remote get-url works
  execSync('git remote add origin https://github.com/test/repo', {
    cwd: repoDir,
    stdio: 'ignore',
  })

  // Reset mock state
  judgeCallCount = 0
  judgeScores = []
  analyzeCallCount = 0
  analyzeFailureResults = []
  cliRunnerCallCount = 0
})

afterEach(() => {
  fs.rmSync(repoDir, { recursive: true, force: true })
})

// --- Tests ---

describe('runLearnMode integration', () => {
  it('processes commits, runs agents in parallel, judges, and logs', async () => {
    // With parallelism=1 and 3 commits, we get 3 baseline runs (1 per commit)
    // Each baseline run gets judged once
    judgeScores = [8.0, 8.0, 8.0]

    await runLearnMode({
      mode: 'learn',
      repoPath: repoDir,
      agentId: 'base2-free-evals',
      parallelism: 1,
      maxCostUsd: 100,
      agentTimeoutMs: 10_000,
      commitCount: 500,
    })

    // Verify log was written with entries for each commit
    const logPath = path.join(repoDir, 'evalbuff-log.jsonl')
    expect(fs.existsSync(logPath)).toBe(true)
    const logLines = fs
      .readFileSync(logPath, 'utf-8')
      .trim()
      .split('\n')
    expect(logLines).toHaveLength(3)

    // Verify state was saved with lastProcessedCommitSha
    const statePath = path.join(repoDir, 'evalbuff-state.json')
    expect(fs.existsSync(statePath)).toBe(true)
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(state.lastProcessedCommitSha).toBe('sha-3')
    expect(state.processedCommitCount).toBe(3)

    // Verify morning report was generated
    const reportFiles = fs
      .readdirSync(repoDir)
      .filter((f) => f.startsWith('evalbuff-report-'))
    expect(reportFiles.length).toBeGreaterThan(0)
  })

  it('attempts doc edit and keeps it when score improves', async () => {
    // parallelism=1: commit1 baseline=4.0, rerun with doc=7.0 (improved, kept)
    // Then analyze returns null to stop loop. commit2 baseline=8.0, analyze returns null.
    // commit3 baseline=8.0, analyze returns null.
    judgeScores = [4.0, 7.0, 8.0, 8.0, 8.0, 8.0]
    const docSuggestion: DocSuggestion = {
      reasoning: 'Agent missed error handling patterns',
      suggestedDocPath: 'patterns/errors.md',
      suggestedContent: '# Error Handling\n\nAlways use try/catch.',
    }
    // First analyze call returns suggestion, then null to stop iterating
    analyzeFailureResults = [docSuggestion, null, null, null]

    await runLearnMode({
      mode: 'learn',
      repoPath: repoDir,
      agentId: 'base2-free-evals',
      parallelism: 1,
      maxCostUsd: 100,
      agentTimeoutMs: 10_000,
      commitCount: 500,
    })

    const logPath = path.join(repoDir, 'evalbuff-log.jsonl')
    const entries = fs
      .readFileSync(logPath, 'utf-8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))

    // First entry should show doc improvement
    expect(entries[0].oldScore).toBe(4.0)
    expect(entries[0].newScore).toBe(7.0)
    expect(entries[0].docEdit).not.toBeNull()

    // Doc should have been applied to the real repo
    const docPath = path.join(repoDir, 'docs', 'patterns', 'errors.md')
    expect(fs.existsSync(docPath)).toBe(true)
    expect(fs.readFileSync(docPath, 'utf-8')).toContain('Error Handling')
  })

  it('stops when cost exceeds maxCostUsd', async () => {
    judgeScores = [8.0, 8.0, 8.0]

    // Pre-set cost at limit
    const statePath = path.join(repoDir, 'evalbuff-state.json')
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        lastProcessedCommitSha: null,
        totalCostUsd: 100.0,
        recentScores: [],
        processedCommitCount: 0,
      }),
    )

    await runLearnMode({
      mode: 'learn',
      repoPath: repoDir,
      agentId: 'base2-free-evals',
      parallelism: 1,
      maxCostUsd: 100,
      agentTimeoutMs: 10_000,
      commitCount: 500,
    })

    // Should not have processed any commits (cost already at limit)
    const logPath = path.join(repoDir, 'evalbuff-log.jsonl')
    expect(fs.existsSync(logPath)).toBe(false)
  })

  it('rejects doc edit when score drops significantly', async () => {
    // Commit1: baseline 5.0, rerun 2.0 (3-point drop, past 1.5 threshold) — doc rejected.
    // Commit2: baseline 8.0, analyze returns null. Commit3: baseline 8.0, null.
    judgeScores = [5.0, 2.0, 8.0, 8.0]
    analyzeFailureResults = [
      {
        reasoning: 'Tried to help',
        suggestedDocPath: 'bad-doc.md',
        suggestedContent: '# Bad Doc\n\nThis will not help.',
      },
      null,
      null,
    ]

    await runLearnMode({
      mode: 'learn',
      repoPath: repoDir,
      agentId: 'base2-free-evals',
      parallelism: 1,
      maxCostUsd: 100,
      agentTimeoutMs: 10_000,
      commitCount: 500,
    })

    // Doc should NOT exist in the real repo
    const docPath = path.join(repoDir, 'docs', 'bad-doc.md')
    expect(fs.existsSync(docPath)).toBe(false)
  })
})

describe('runPromptMode integration', () => {
  it('runs agents on a prompt and attempts doc improvement', async () => {
    judgeScores = [5.0, 7.0]
    analyzeFailureResults = [
      {
        reasoning: 'Agent needs better context',
        suggestedDocPath: 'conventions/api.md',
        suggestedContent: '# API Conventions\n\nUse REST.',
      },
      null, // stop after first improvement
    ]

    await runPromptMode({
      mode: 'prompt',
      repoPath: repoDir,
      agentId: 'base2-free-evals',
      parallelism: 1,
      maxCostUsd: 100,
      agentTimeoutMs: 10_000,
      prompt: 'Add a new API endpoint for users',
    })

    // Verify log was written
    const logPath = path.join(repoDir, 'evalbuff-log.jsonl')
    expect(fs.existsSync(logPath)).toBe(true)
    const entry = JSON.parse(
      fs.readFileSync(logPath, 'utf-8').trim(),
    )
    expect(entry.taskId).toBe('prompt-mode')
  })
})
