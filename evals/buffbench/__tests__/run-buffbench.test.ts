import { describe, expect, test } from 'bun:test'

import { generateEvalTask } from '../eval-task-generator'
import { judgeCommitResult } from '../judge'
import { summarizeAgentRuns } from '../run-buffbench'

import type { OpenbuffClient } from '@openbuff/sdk'
import type { AgentEvalResults, EvalCommitV2, EvalRun } from '../types'

function makeEvalRun(overrides: Partial<EvalRun> = {}): EvalRun {
  return {
    commitSha: overrides.commitSha ?? 'abc123',
    prompt: overrides.prompt ?? 'do the thing',
    diff: overrides.diff ?? '',
    judging: overrides.judging ?? {
      analysis: '',
      strengths: [],
      weaknesses: [],
      completionScore: 5,
      codeQualityScore: 5,
      overallScore: 5,
    },
    cost: overrides.cost ?? 10,
    durationMs: overrides.durationMs ?? 5_000,
    error: overrides.error,
    finalCheckOutputs: overrides.finalCheckOutputs,
  }
}

function makeAgentResults(runs: EvalRun[]): AgentEvalResults {
  return {
    agentId: 'agent-a',
    runs,
    averageScore: 0,
    averageScoreExcludingFailures: 0,
    averageCost: 0,
    averageDuration: 0,
  }
}

describe('generateEvalTask', () => {
  test('registers helper agents required by eval task exploration agents', async () => {
    const runInputs: Array<{ agentDefinitions?: Array<{ id: string }> }> = []
    const client = {
      run: async (input: { agentDefinitions?: Array<{ id: string }> }) => {
        runInputs.push(input)
        return {
          output: {
            type: 'structuredOutput' as const,
            value: {
              id: 'generated-task',
              reasoning: 'ok',
              spec: 'spec',
              prompt: 'prompt',
              supplementalFiles: [],
            },
          },
        }
      },
    } as unknown as OpenbuffClient

    await generateEvalTask({
      client,
      input: {
        commitSha: 'abc123',
        parentSha: 'def456',
        diff: 'diff --git a/src/a.ts b/src/a.ts',
        editedFilePaths: ['src/a.ts'],
        repoPath: '/tmp/repo',
      },
    })

    const registeredIds = runInputs[0]!.agentDefinitions!.map((def) => def.id)

    expect(registeredIds).toEqual(
      expect.arrayContaining([
        'eval-task-generator',
        'file-explorer',
        'find-all-referencer',
        'file-picker',
        'file-lister',
        'code-searcher',
        'directory-lister',
        'glob-matcher',
      ]),
    )
  })
})

describe('judgeCommitResult', () => {
  test('includes the generated task spec in every judge prompt', async () => {
    const judgePrompts: string[] = []
    const client = {
      run: async (input: { prompt: string }) => {
        judgePrompts.push(input.prompt)
        return {
          output: {
            type: 'structuredOutput' as const,
            value: {
              analysis: 'ok',
              strengths: [],
              weaknesses: [],
              completionScore: 5,
              codeQualityScore: 5,
              overallScore: 5,
            },
          },
        }
      },
    } as unknown as OpenbuffClient
    const commit: EvalCommitV2 = {
      id: 'task-with-spec',
      sha: 'abc123',
      parentSha: 'def456',
      spec: 'The implementation must update the cache and expose a new status line.',
      prompt: 'Fix the cache status bug.',
      supplementalFiles: [],
      fileDiffs: [
        {
          path: 'src/cache.ts',
          status: 'modified',
          diff: '@@ -1 +1 @@\n-old\n+new',
        },
      ],
    }

    await judgeCommitResult({
      client,
      commit,
      contextFiles: {},
      agentDiff: 'diff --git a/src/cache.ts b/src/cache.ts',
    })

    expect(judgePrompts).toHaveLength(2)
    for (const prompt of judgePrompts) {
      expect(prompt).toContain('## User Prompt (What the agent was asked to do)')
      expect(prompt).toContain('Fix the cache status bug.')
      expect(prompt).toContain('## Task Specification (Expected observable outcome)')
      expect(prompt).toContain(
        'The implementation must update the cache and expose a new status line.',
      )
    }
  })
})

describe('summarizeAgentRuns', () => {
  test('excludes only the failing agent run instead of every run from that commit', () => {
    const healthyRun = makeEvalRun({ commitSha: 'same-commit' })
    const failedRun = makeEvalRun({
      commitSha: 'same-commit',
      error: 'agent failed before judging',
    })

    const healthySummary = summarizeAgentRuns(makeAgentResults([healthyRun]))
    const failedSummary = summarizeAgentRuns(makeAgentResults([failedRun]))

    expect(healthySummary.validRuns).toEqual([healthyRun])
    expect(failedSummary.validRuns).toEqual([])
  })

  test('keeps low-scoring valid runs in validRuns but excludes them from failure-trimmed averages', () => {
    const lowScoreRun = makeEvalRun({
      judging: {
        analysis: '',
        strengths: [],
        weaknesses: [],
        completionScore: 1,
        codeQualityScore: 1,
        overallScore: 1,
      },
    })
    const normalRun = makeEvalRun({
      judging: {
        analysis: '',
        strengths: [],
        weaknesses: [],
        completionScore: 6,
        codeQualityScore: 6,
        overallScore: 6,
      },
    })

    const summary = summarizeAgentRuns(makeAgentResults([lowScoreRun, normalRun]))

    expect(summary.validRuns).toEqual([lowScoreRun, normalRun])
    expect(summary.runsExcludingFailures).toEqual([normalRun])
  })
})
