import { describe, expect, test } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  computeCacheUsageMetrics,
  evaluateCacheRecall,
} from '../cache-recall-eval'
import { generateEvalTask } from '../eval-task-generator'
import { cacheRecallEvalToFinalCheckOutput } from '../agent-runner'
import { formatAgentResult } from '../format-output'
import { judgeCommitResult } from '../judge'
import {
  mergeIdiomPatternFindings,
  runTask,
  summarizeAgentRuns,
} from '../run-buffbench'

import type { OpenbuffClient } from '@openbuff/sdk'
import type {
  AgentEvalResults,
  EvalCommitV2,
  EvalDataV2,
  EvalRun,
} from '../types'

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
    averageIdiomScore: undefined,
    averageCost: 0,
    averageDuration: 0,
  }
}

describe('eval-idioms-v1 fixture', () => {
  test('contains python, rust, and go idiom seed tasks with useful validation', () => {
    const evalPath = path.join(__dirname, '..', 'eval-idioms-v1.json')
    const evalData = JSON.parse(fs.readFileSync(evalPath, 'utf8')) as EvalDataV2

    expect(evalData.evalCommits.map((commit) => commit.id)).toEqual([
      'idiom-seed-python-pathlib-contexts-comprehensions',
      'idiom-seed-rust-result-ownership-iterators',
      'idiom-seed-go-errors-wrapping-interfaces-gofmt',
    ])
    expect(evalData.finalCheckCommands).toEqual(
      expect.arrayContaining([
        'python -m pytest',
        'python -m ruff check .',
        'cargo test',
        'cargo clippy -- -D warnings',
        'go test ./...',
        'gofmt -w . && git diff --exit-code',
      ]),
    )

    const byId = new Map(
      evalData.evalCommits.map((commit) => [commit.id, commit]),
    )
    const pythonTask = byId.get(
      'idiom-seed-python-pathlib-contexts-comprehensions',
    )
    const rustTask = byId.get('idiom-seed-rust-result-ownership-iterators')
    const goTask = byId.get('idiom-seed-go-errors-wrapping-interfaces-gofmt')

    expect(pythonTask?.prompt).toContain('pathlib')
    expect(pythonTask?.prompt).toContain('context managers')
    expect(pythonTask?.spec).toContain('comprehensions')
    expect(pythonTask?.spec).toContain('typed')

    expect(rustTask?.prompt).toContain('Result')
    expect(rustTask?.prompt).toContain('?')
    expect(rustTask?.prompt).toContain('unwrap')
    expect(rustTask?.spec).toContain('ownership')
    expect(rustTask?.spec).toContain('iterator')

    expect(goTask?.prompt).toContain('%w')
    expect(goTask?.prompt).toContain('gofmt')
    expect(goTask?.spec).toContain('errors explicitly')
    expect(goTask?.spec).toContain('interfaces small')

    for (const commit of evalData.evalCommits) {
      expect(commit.spec).toContain('Initial seed fixture')
      expect(commit.fileDiffs.length).toBeGreaterThan(0)
      expect(
        commit.supplementalFiles.some((file) =>
          file.startsWith('agents/idioms/'),
        ),
      ).toBe(true)
    }
  })
})

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
      expect(prompt).toContain(
        '## User Prompt (What the agent was asked to do)',
      )
      expect(prompt).toContain('Fix the cache status bug.')
      expect(prompt).toContain(
        '## Task Specification (Expected observable outcome)',
      )
      expect(prompt).toContain(
        'The implementation must update the cache and expose a new status line.',
      )
    }
  })

  test('averages optional idiom rubric fields without requiring old judge outputs', async () => {
    const judgeOutputs = [
      {
        analysis: 'first',
        strengths: ['uses pathlib'],
        weaknesses: [],
        completionScore: 8,
        codeQualityScore: 7,
        overallScore: 7,
        idiomScore: 6,
        nonIdiomaticPatternsDetected: ['manual path string concatenation'],
      },
      {
        analysis: 'second',
        strengths: [],
        weaknesses: ['still has Java-style getters'],
        completionScore: 6,
        codeQualityScore: 5,
        overallScore: 5,
      },
    ]
    const client = {
      run: async () => ({
        output: {
          type: 'structuredOutput' as const,
          value: judgeOutputs.shift()!,
        },
      }),
    } as unknown as OpenbuffClient
    const commit: EvalCommitV2 = {
      id: 'python-idiom-task',
      sha: 'abc123',
      parentSha: 'def456',
      spec: 'Use Python pathlib idioms.',
      prompt: 'Make file handling idiomatic Python.',
      supplementalFiles: [],
      fileDiffs: [
        {
          path: 'tool.py',
          status: 'modified',
          diff: '@@ -1 +1 @@\n-old\n+new',
        },
      ],
    }

    const result = await judgeCommitResult({
      client,
      commit,
      contextFiles: {},
      agentDiff: 'diff --git a/tool.py b/tool.py',
    })

    expect(result.overallScore).toBe(6)
    expect(result.codeQualityScore).toBe(6)
    expect(result.idiomScore).toBe(6)
    expect(result.nonIdiomaticPatternsDetected).toEqual([
      'manual path string concatenation',
    ])
  })
})

describe('formatAgentResult', () => {
  test('prints optional idiom rubric fields when present', () => {
    const output = formatAgentResult({
      agentId: 'agent-a',
      commit: {
        id: 'task',
        sha: 'abc123',
        parentSha: 'def456',
        spec: '',
        prompt: 'Do it idiomatically.',
        supplementalFiles: [],
        fileDiffs: [],
      },
      judging: {
        analysis: 'ok',
        strengths: [],
        weaknesses: [],
        completionScore: 8,
        codeQualityScore: 7,
        overallScore: 7,
        idiomScore: 4,
        nonIdiomaticPatternsDetected: ['unnecessary clone'],
      },
      cost: 0.01,
      durationMs: 1_000,
      agentNumber: 1,
      totalAgents: 1,
    })

    expect(output).toContain('Idiom Score:         4.0/10')
    expect(output).toContain('Non-Idiomatic Patterns:')
    expect(output).toContain('unnecessary clone')
  })

  test('prints deterministic idiom pattern findings merged into judging output', () => {
    const judging = mergeIdiomPatternFindings(
      {
        analysis: 'ok',
        strengths: [],
        weaknesses: [],
        completionScore: 8,
        codeQualityScore: 7,
        overallScore: 7,
        nonIdiomaticPatternsDetected: ['manual review finding'],
      },
      [
        {
          patternId: 'python-manual-open-close',
          language: 'python',
          path: 'tool.py',
          lineNumber: 12,
          line: 'handle = open(path)',
          message: 'Use a context manager when opening files.',
        },
      ],
    )

    const output = formatAgentResult({
      agentId: 'agent-a',
      commit: {
        id: 'task',
        sha: 'abc123',
        parentSha: 'def456',
        spec: '',
        prompt: 'Do it idiomatically.',
        supplementalFiles: [],
        fileDiffs: [],
      },
      judging,
      cost: 0.01,
      durationMs: 1_000,
      agentNumber: 1,
      totalAgents: 1,
    })

    expect(judging.nonIdiomaticPatternsDetected).toEqual([
      'manual review finding',
      'python-manual-open-close (tool.py:12): Use a context manager when opening files.',
    ])
    expect(output).toContain('python-manual-open-close (tool.py:12)')
  })
})

describe('runTask proposal dry-run reporting', () => {
  test('stores lessons-extractor proposals as review-only dry-run reports', async () => {
    const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buffbench-test-'))
    let lessonsPrompt = ''
    const client = {
      run: async (input: { agent?: string; prompt?: string }) => {
        if (input.agent === 'buffbench-lessons-extractor') {
          lessonsPrompt = input.prompt ?? ''
          return {
            output: {
              type: 'structuredOutput' as const,
              value: {
                lessons: [
                  {
                    whatWentWrong: 'Edited Python without reading idioms.',
                    whatShouldHaveBeenDone:
                      'Read agents/idioms/python.md first.',
                  },
                ],
                proposals: [
                  {
                    kind: 'append_system_prompt_guidance',
                    target: { agentId: 'agent-a' },
                    guidance:
                      'Before non-trivial Python edits, read agents/idioms/python.md.',
                    rationale: 'Addresses the missing idiom-read lesson.',
                  },
                ],
              },
            },
          }
        }

        return {
          output: {
            type: 'structuredOutput' as const,
            value: {
              analysis: 'ok',
              strengths: [],
              weaknesses: [],
              completionScore: 6,
              codeQualityScore: 6,
              overallScore: 6,
              idiomScore: 4,
              nonIdiomaticPatternsDetected: ['manual open()'],
            },
          },
        }
      },
    } as unknown as OpenbuffClient

    try {
      const { agentResults, commitTraces } = await runTask({
        client,
        commit: {
          id: 'python-proposal-task',
          sha: 'abcdef1234567890',
          parentSha: 'parent',
          spec: 'Use Python idioms.',
          prompt: 'Make Python file handling idiomatic.',
          supplementalFiles: [],
          fileDiffs: [],
        },
        agents: ['agent-a'],
        repoUrl: 'https://example.com/repo.git',
        logsDir,
        index: 0,
        totalTasks: 1,
        analyzerContext: {
          agentDefinitions: [],
          agentTypeDefinition: '',
          testedAgentIds: ['agent-a'],
        },
        localAgentDefinitions: [
          {
            id: 'agent-a',
            displayName: 'Agent A',
            systemPrompt: 'You are agent A.',
          },
        ],
        extractLessons: true,
        printEvents: false,
        disableAnalysis: true,
        runAgentOnCommitImpl: async () => ({
          diff: 'diff --git a/tool.py b/tool.py',
          contextFiles: {},
          durationMs: 10,
          cost: 0,
          trace: [],
          retrievalFlow: {
            queryCallCount: 0,
            queryResultPaths: [],
            successfulReadPaths: [],
            relevantReadPaths: [],
            irrelevantReadPaths: [],
          },
        }),
      })

      expect(lessonsPrompt).toContain('Idiom Score: 4/10')
      expect(lessonsPrompt).toContain('Non-Idiomatic Patterns: manual open()')

      const proposalDryRun = agentResults[0]?.evalRun.proposalDryRun
      expect(proposalDryRun?.appliedCount).toBe(1)
      expect(proposalDryRun?.summary[0]).toContain('[dry-run] agent-a')
      expect(proposalDryRun?.summary[0]).toContain('APPLIED')
      expect(commitTraces[0]?.proposalDryRun?.proposals[0]?.kind).toBe(
        'append_system_prompt_guidance',
      )

      const traceFiles = fs
        .readdirSync(logsDir)
        .filter((file) => file.endsWith('.json') && !file.includes('ANALYSIS'))
      const traceJson = JSON.parse(
        fs.readFileSync(path.join(logsDir, traceFiles[0]!), 'utf8'),
      )
      expect(traceJson.proposalDryRun.summary[0]).toContain('[dry-run]')

      const lessonsFile = path.join(
        __dirname,
        '..',
        'agent-lessons',
        'agent-a.md',
      )
      const lessonsText = fs.readFileSync(lessonsFile, 'utf8')
      expect(lessonsText).toContain('### Proposal dry-run')
      expect(lessonsText).toContain('append system-prompt guidance')
    } finally {
      fs.rmSync(logsDir, { recursive: true, force: true })
      fs.rmSync(path.join(__dirname, '..', 'agent-lessons'), {
        recursive: true,
        force: true,
      })
    }
  })
})

describe('runTask idiom pattern reporting', () => {
  test('persists deterministic idiom pattern findings from agent diffs', async () => {
    const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buffbench-test-'))
    const diff = `diff --git a/tool.py b/tool.py
@@ -1,2 +1,3 @@
 def load(path):
+    handle = open(path)
     return []
`
    const client = {
      run: async () => ({
        output: {
          type: 'structuredOutput' as const,
          value: {
            analysis: 'ok',
            strengths: [],
            weaknesses: [],
            completionScore: 8,
            codeQualityScore: 7,
            overallScore: 7,
          },
        },
      }),
    } as unknown as OpenbuffClient

    try {
      const { agentResults, commitTraces } = await runTask({
        client,
        commit: {
          id: 'python-pattern-task',
          sha: 'abcdef1234567890',
          parentSha: 'parent',
          spec: 'Use context managers.',
          prompt: 'Make Python file handling idiomatic.',
          supplementalFiles: [],
          fileDiffs: [],
        },
        agents: ['agent-a'],
        repoUrl: 'https://example.com/repo.git',
        logsDir,
        index: 0,
        totalTasks: 1,
        analyzerContext: {
          agentDefinitions: [],
          agentTypeDefinition: '',
          testedAgentIds: ['agent-a'],
        },
        localAgentDefinitions: [],
        extractLessons: false,
        printEvents: false,
        disableAnalysis: true,
        runAgentOnCommitImpl: async () => ({
          diff,
          contextFiles: {},
          durationMs: 10,
          cost: 0,
          trace: [],
          retrievalFlow: {
            queryCallCount: 0,
            queryResultPaths: [],
            successfulReadPaths: [],
            relevantReadPaths: [],
            irrelevantReadPaths: [],
          },
        }),
      })

      const expectedPattern =
        'python-manual-open-close (tool.py:2): Use a context manager when opening files.'
      expect(
        agentResults[0]?.evalRun.judging.nonIdiomaticPatternsDetected,
      ).toContain(expectedPattern)
      expect(
        commitTraces[0]?.judgeResult.nonIdiomaticPatternsDetected,
      ).toContain(expectedPattern)

      const traceFiles = fs
        .readdirSync(logsDir)
        .filter((file) => file.endsWith('.json') && !file.includes('ANALYSIS'))
      expect(traceFiles).toHaveLength(1)
      const traceJson = JSON.parse(
        fs.readFileSync(path.join(logsDir, traceFiles[0]!), 'utf8'),
      )
      expect(traceJson.judgeResult.nonIdiomaticPatternsDetected).toContain(
        expectedPattern,
      )
    } finally {
      fs.rmSync(logsDir, { recursive: true, force: true })
    }
  })
})

describe('cache recall eval', () => {
  test('passes when cache ratio and required recall substrings meet thresholds', () => {
    const result = evaluateCacheRecall({
      config: {
        minCacheHitRatio: 0.5,
        requiredRecallSubstrings: [
          '<knowledge_memory>',
          'Validated: typecheck clean',
        ],
      },
      cacheUsage: computeCacheUsageMetrics({
        cachedInputTokens: 600,
        inputTokens: 1000,
      }),
      finalMessageHistoryText:
        '<knowledge_memory>Validated: typecheck clean</knowledge_memory>',
    })

    expect(result).toEqual({
      passed: true,
      cachedInputTokens: 600,
      inputTokens: 1000,
      cacheHitRatio: 0.6,
      minCacheHitRatio: 0.5,
      cacheHitRatioPassed: true,
      requiredRecallSubstrings: [
        '<knowledge_memory>',
        'Validated: typecheck clean',
      ],
      missingRecallSubstrings: [],
      recallEvaluated: true,
      recallPassed: true,
      failureReason: undefined,
    })
  })

  test('fails when cache ratio is unavailable or recall substrings are missing', () => {
    const result = evaluateCacheRecall({
      config: {
        minCacheHitRatio: 0.25,
        requiredRecallSubstrings: ['Decision: keep the cache anchor stable'],
      },
      finalMessageHistoryText: '<knowledge_memory></knowledge_memory>',
    })

    expect(result.passed).toBe(false)
    expect(result.cacheHitRatioPassed).toBe(false)
    expect(result.recallPassed).toBe(false)
    expect(result.missingRecallSubstrings).toEqual([
      'Decision: keep the cache anchor stable',
    ])
    expect(result.failureReason).toContain('cache hit ratio unavailable')
    expect(result.failureReason).toContain('missing recall substrings')
  })

  test('exposes cache recall as a deterministic final check output', () => {
    const output = cacheRecallEvalToFinalCheckOutput(
      evaluateCacheRecall({
        config: { minCacheHitRatio: 0.9 },
        cacheUsage: computeCacheUsageMetrics({
          cachedInputTokens: 1,
          inputTokens: 10,
        }),
      }),
    )

    expect(output.command).toBe('buffbench cache-usage eval')
    expect(output.exitCode).toBe(1)
    expect(output.stderr).toContain('cache hit ratio 0.100 below required 0.9')
    expect(JSON.parse(output.stdout)).toMatchObject({
      passed: false,
      cacheHitRatio: 0.1,
      recallEvaluated: false,
    })
  })

  test('fails closed when recall assertions are required but missing', () => {
    const result = evaluateCacheRecall({
      config: { requireRecallAssertions: true },
    })

    expect(result.passed).toBe(false)
    expect(result.recallEvaluated).toBe(false)
    expect(result.recallPassed).toBe(false)
    expect(result.failureReason).toContain('recall assertions are required')
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

    const summary = summarizeAgentRuns(
      makeAgentResults([lowScoreRun, normalRun]),
    )

    expect(summary.validRuns).toEqual([lowScoreRun, normalRun])
    expect(summary.runsExcludingFailures).toEqual([normalRun])
  })
})
