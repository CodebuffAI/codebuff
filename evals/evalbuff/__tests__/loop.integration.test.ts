import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import type { JudgingResult } from '../judge'
import type { DocSuggestion } from '../docs-optimizer'
import type { EvalDataV2 } from '../types'

// --- Mocks ---

// Track calls to mocked functions
let judgeCallCount = 0
let judgeScores: number[] = []
let analyzeFailureResult: DocSuggestion | null = null
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

// Mock CLI runner to return a fake result
mock.module('../cli-runner', () => ({
  runCliAgent: async () => {
    cliRunnerCallCount++
    return {
      diff: 'mock diff content',
      durationMs: 1000,
      exitCode: 0,
      stdout: 'mock stdout',
      stderr: '',
    }
  },
}))

// Mock judge to return configurable scores
mock.module('../judge', () => ({
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
  analyzeFailure: async () => analyzeFailureResult,
}))

// Mock CodebuffClient
mock.module('@codebuff/sdk', () => ({
  CodebuffClient: class {
    constructor() {}
    async run() {
      return { output: { type: 'text', value: '' } }
    }
  },
}))

// Import after mocks are set up
const { runEvalbuff } = await import('../run-evalbuff')

// --- Test fixtures ---

let repoDir: string
let evalFilePath: string

function createEvalFile(taskCount: number): string {
  const evalData: EvalDataV2 = {
    repoUrl: 'https://github.com/test/repo',
    generationDate: '2026-03-25',
    evalCommits: Array.from({ length: taskCount }, (_, i) => ({
      id: `task-${i + 1}`,
      sha: `sha-${i + 1}`,
      parentSha: `parent-${i + 1}`,
      spec: `Test task ${i + 1}`,
      prompt: `Do task ${i + 1}`,
      supplementalFiles: [],
      fileDiffs: [
        {
          path: `src/file${i + 1}.ts`,
          status: 'modified' as const,
          diff: `@@ -1 +1 @@\n-old\n+new`,
        },
      ],
    })),
  }

  const filePath = path.join(repoDir, `eval-test.json`)
  fs.writeFileSync(filePath, JSON.stringify(evalData))
  return filePath
}

beforeEach(() => {
  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalbuff-integ-'))
  execSync('git init && git add . && git commit --allow-empty -m "init"', {
    cwd: repoDir,
    stdio: 'ignore',
  })
  evalFilePath = createEvalFile(5)

  // Reset mock state
  judgeCallCount = 0
  judgeScores = []
  analyzeFailureResult = null
  cliRunnerCallCount = 0
})

afterEach(() => {
  fs.rmSync(repoDir, { recursive: true, force: true })
})

// --- Tests ---

describe('runEvalbuff integration', () => {
  it('completes one full iteration: runs agent, judges, and logs', async () => {
    judgeScores = [8.0] // Above threshold, no doc edit attempted

    await runEvalbuff({
      repoPath: repoDir,
      agentCommand: 'echo',
      evalDataPaths: [evalFilePath],
      maxIterations: 1,
      maxCostUsd: 100,
      scoreThreshold: 7.0,
      agentTimeoutMs: 10_000,
    })

    // Verify log was written
    const logPath = path.join(repoDir, 'evalbuff-log.jsonl')
    expect(fs.existsSync(logPath)).toBe(true)
    const logLines = fs
      .readFileSync(logPath, 'utf-8')
      .trim()
      .split('\n')
    expect(logLines).toHaveLength(1)

    const entry = JSON.parse(logLines[0])
    expect(entry.taskId).toBe('task-1')
    expect(entry.oldScore).toBe(8.0)
    expect(entry.docEdit).toBeNull()

    // Verify state was saved
    const statePath = path.join(repoDir, 'evalbuff-state.json')
    expect(fs.existsSync(statePath)).toBe(true)
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(state.completedTaskIds).toContain('task-1')

    // Verify morning report was generated
    const reportFiles = fs
      .readdirSync(repoDir)
      .filter((f) => f.startsWith('evalbuff-report-'))
    expect(reportFiles.length).toBeGreaterThan(0)
  })

  it('attempts doc edit when score is below threshold', async () => {
    // First judge call returns low score, second (after doc edit) returns higher
    judgeScores = [4.0, 6.0]
    analyzeFailureResult = {
      reasoning: 'Agent missed error handling patterns',
      suggestedDocPath: 'patterns/errors.md',
      suggestedContent: '# Error Handling\n\nAlways use try/catch.',
    }

    await runEvalbuff({
      repoPath: repoDir,
      agentCommand: 'echo',
      evalDataPaths: [evalFilePath],
      maxIterations: 1,
      maxCostUsd: 100,
      scoreThreshold: 7.0,
      agentTimeoutMs: 10_000,
    })

    const logPath = path.join(repoDir, 'evalbuff-log.jsonl')
    const entry = JSON.parse(fs.readFileSync(logPath, 'utf-8').trim())
    expect(entry.oldScore).toBe(4.0)
    expect(entry.newScore).toBe(6.0)
    expect(entry.scoreComparison).toBe('improved')
    expect(entry.docEdit).not.toBeNull()
    expect(entry.docEdit.path).toBe('patterns/errors.md')

    // Doc should have been applied to the real repo
    const docPath = path.join(repoDir, 'docs', 'patterns', 'errors.md')
    expect(fs.existsSync(docPath)).toBe(true)
    expect(fs.readFileSync(docPath, 'utf-8')).toContain('Error Handling')
  })

  it('stops at maxIterations', async () => {
    judgeScores = [8.0, 8.0, 8.0, 8.0, 8.0]

    await runEvalbuff({
      repoPath: repoDir,
      agentCommand: 'echo',
      evalDataPaths: [evalFilePath], // 5 tasks available
      maxIterations: 2,
      maxCostUsd: 100,
      scoreThreshold: 7.0,
      agentTimeoutMs: 10_000,
    })

    const logPath = path.join(repoDir, 'evalbuff-log.jsonl')
    const logLines = fs
      .readFileSync(logPath, 'utf-8')
      .trim()
      .split('\n')
    expect(logLines).toHaveLength(2)

    const state = JSON.parse(
      fs.readFileSync(path.join(repoDir, 'evalbuff-state.json'), 'utf-8'),
    )
    expect(state.completedTaskIds).toHaveLength(2)
  })

  it('stops when cost exceeds maxCostUsd', async () => {
    judgeScores = [8.0, 8.0, 8.0, 8.0, 8.0]

    // First run — complete 1 task, which will accumulate some cost
    await runEvalbuff({
      repoPath: repoDir,
      agentCommand: 'echo',
      evalDataPaths: [evalFilePath],
      maxIterations: 1,
      maxCostUsd: 100,
      scoreThreshold: 7.0,
      agentTimeoutMs: 10_000,
    })

    // Manually set cost in state to be at the limit
    const statePath = path.join(repoDir, 'evalbuff-state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    state.totalCostUsd = 100.0
    fs.writeFileSync(statePath, JSON.stringify(state))

    // Second run — should stop immediately due to cost (>= maxCostUsd)
    await runEvalbuff({
      repoPath: repoDir,
      agentCommand: 'echo',
      evalDataPaths: [evalFilePath],
      maxIterations: 50,
      maxCostUsd: 100,
      scoreThreshold: 7.0,
      agentTimeoutMs: 10_000,
    })

    // Should still only have 1 completed task (cost check prevents new tasks)
    const finalState = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(finalState.completedTaskIds).toHaveLength(1)
  })

  it('resumes from state file and skips completed tasks', async () => {
    judgeScores = [8.0, 8.0, 8.0, 8.0, 8.0]

    // Pre-populate state with 2 completed tasks
    const statePath = path.join(repoDir, 'evalbuff-state.json')
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        completedTaskIds: ['task-1', 'task-2'],
        totalCostUsd: 5.0,
        recentScores: [7.0, 8.0],
      }),
    )

    await runEvalbuff({
      repoPath: repoDir,
      agentCommand: 'echo',
      evalDataPaths: [evalFilePath], // 5 tasks
      maxIterations: 50,
      maxCostUsd: 100,
      scoreThreshold: 7.0,
      agentTimeoutMs: 10_000,
    })

    // Should have processed tasks 3-5 (skipped 1 and 2)
    const logPath = path.join(repoDir, 'evalbuff-log.jsonl')
    const logLines = fs
      .readFileSync(logPath, 'utf-8')
      .trim()
      .split('\n')
    expect(logLines).toHaveLength(3)

    const taskIds = logLines.map((l) => JSON.parse(l).taskId)
    expect(taskIds).toEqual(['task-3', 'task-4', 'task-5'])

    const finalState = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(finalState.completedTaskIds).toHaveLength(5)
  })

  it('reverts doc edit when score does not improve', async () => {
    // First judge: low score, second judge: even lower (doc didn't help)
    judgeScores = [4.0, 3.0]
    analyzeFailureResult = {
      reasoning: 'Tried to help',
      suggestedDocPath: 'bad-doc.md',
      suggestedContent: '# Bad Doc\n\nThis will not help.',
    }

    await runEvalbuff({
      repoPath: repoDir,
      agentCommand: 'echo',
      evalDataPaths: [evalFilePath],
      maxIterations: 1,
      maxCostUsd: 100,
      scoreThreshold: 7.0,
      agentTimeoutMs: 10_000,
    })

    const logPath = path.join(repoDir, 'evalbuff-log.jsonl')
    const entry = JSON.parse(fs.readFileSync(logPath, 'utf-8').trim())
    expect(entry.scoreComparison).toBe('worse')

    // Doc should NOT exist in the real repo
    const docPath = path.join(repoDir, 'docs', 'bad-doc.md')
    expect(fs.existsSync(docPath)).toBe(false)
  })
})
