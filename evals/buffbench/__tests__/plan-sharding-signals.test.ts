import { expect, describe, test } from 'bun:test'

import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

import {
  classifyPrompt,
  classifyBreadth,
  extractSpawnAgentsCalls,
  extractSubagentStarts,
  computePlanShardingSignals,
  evaluateShardingVerdict,
  evaluateMinimumShardRule,
  buildCoverageMatrix,
  buildPlannerOutputCoverage,
  evaluatePlannerOutputCoverage,
  evaluateSubsystemEnumeration,
  type PromptKind,
  type MinimumShardEvaluation,
  type CoverageMatrix,
  type PlannerOutputCoverage,
  type SubsystemEnumeration,
} from '../plan-sharding-signals'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function toolCall(
  toolName: string,
  input: Record<string, unknown>,
  overrides: Partial<{ toolCallId: string; parentAgentId: string }> = {},
): PrintModeEvent {
  return {
    type: 'tool_call',
    toolCallId:
      overrides.toolCallId ?? `tc-${Math.random().toString(36).slice(2, 8)}`,
    toolName,
    input,
    parentAgentId: overrides.parentAgentId,
  } as PrintModeEvent
}

function spawnAgentsCall(
  agents: Array<{
    agent_type: string
    prompt: string
    params?: Record<string, unknown>
  }>,
  overrides: Partial<{ toolCallId: string; parentAgentId: string }> = {},
): PrintModeEvent {
  return toolCall('spawn_agents', { agents }, overrides)
}

function subagentStart(
  overrides: Partial<{
    agentId: string
    agentType: string
    onlyChild: boolean
    parentAgentId: string
  }> = {},
): PrintModeEvent {
  return {
    type: 'subagent_start',
    agentId:
      overrides.agentId ?? `sub-${Math.random().toString(36).slice(2, 8)}`,
    agentType: overrides.agentType ?? 'file-picker',
    displayName: overrides.agentType ?? 'file-picker',
    onlyChild: overrides.onlyChild ?? false,
    parentAgentId: overrides.parentAgentId,
  } as PrintModeEvent
}

function subagentFinish(
  overrides: Partial<{
    agentId: string
    agentType: string
    onlyChild: boolean
    parentAgentId: string
  }> = {},
): PrintModeEvent {
  return {
    type: 'subagent_finish',
    agentId: overrides.agentId ?? 'sub-finish',
    agentType: overrides.agentType ?? 'file-picker',
    displayName: overrides.agentType ?? 'file-picker',
    onlyChild: overrides.onlyChild ?? false,
    parentAgentId: overrides.parentAgentId,
  } as PrintModeEvent
}

function textEvent(text: string): PrintModeEvent {
  return { type: 'text', text } as PrintModeEvent
}

const AUDIT_PROMPT =
  'Audit this codebase for any feature improvements that can be made.'
const PRODUCTION_READY_AUDIT_PROMPT =
  'Assess this codebase for how production ready it is on a feature, security and code level'
const IMPL_PROMPT = 'Implement a login form with email and password fields.'
const QUESTION_PROMPT = 'How does the config loader resolve relative paths?'
const SHORT_PROMPT = 'do the thing'

// ---------------------------------------------------------------------------
// classifyPrompt
// ---------------------------------------------------------------------------

describe('classifyPrompt', () => {
  test('classifies audit-style prompts as audit', () => {
    expect(classifyPrompt(AUDIT_PROMPT)).toBe('audit')
    expect(
      classifyPrompt('Please review the codebase for technical debt.'),
    ).toBe('audit')
    expect(classifyPrompt('check this codebase for any issues')).toBe('audit')
    expect(classifyPrompt('Run a codebase audit for security review.')).toBe(
      'audit',
    )
    expect(classifyPrompt(PRODUCTION_READY_AUDIT_PROMPT)).toBe('audit')
  })

  test('classifies implementation prompts as implementation', () => {
    expect(classifyPrompt(IMPL_PROMPT)).toBe('implementation')
    expect(classifyPrompt('Fix the bug in the auth module.')).toBe(
      'implementation',
    )
    expect(classifyPrompt('Refactor the config loader.')).toBe('implementation')
  })

  test('classifies question prompts ending in ? as question', () => {
    expect(classifyPrompt(QUESTION_PROMPT)).toBe('question')
    expect(classifyPrompt('What does the config loader do?')).toBe('question')
  })

  test('classifies very short prompts as ambiguous', () => {
    expect(classifyPrompt(SHORT_PROMPT)).toBe('ambiguous')
    expect(classifyPrompt('go')).toBe('ambiguous')
  })

  test('audit wins over implementation when both match', () => {
    // "Audit the codebase then implement the fixes" → audit
    expect(
      classifyPrompt('Audit the codebase then implement the fixes you find.'),
    ).toBe('audit')
  })

  test('is case-insensitive', () => {
    expect(classifyPrompt('AUDIT THIS CODEBASE')).toBe('audit')
    expect(classifyPrompt('Implement A Feature')).toBe('implementation')
  })
})

// ---------------------------------------------------------------------------
// classifyBreadth
// ---------------------------------------------------------------------------

describe('classifyBreadth', () => {
  test('broad-audit: >= 3 domains, no file target', () => {
    const result = classifyBreadth(
      'Audit the agents, sdk, cli, and common subsystems for issues',
    )
    expect(result.kind).toBe('broad-audit')
    expect(result.domainCount).toBe(4)
    expect(result.domains).toEqual(['agents', 'cli', 'common', 'sdk'])
    expect(result.hasBreadthMarker).toBe(false)
    expect(result.hasSingleFileTarget).toBe(false)
  })

  test('broad-audit: breadth marker phrase, no file target', () => {
    const result = classifyBreadth(
      'Review the whole codebase for technical debt',
    )
    expect(result.kind).toBe('broad-audit')
    expect(result.hasBreadthMarker).toBe(true)
    expect(result.hasSingleFileTarget).toBe(false)
  })

  test('broad-audit: "entire codebase" marker', () => {
    const result = classifyBreadth(
      'Find security issues across the entire codebase',
    )
    expect(result.kind).toBe('broad-audit')
    expect(result.hasBreadthMarker).toBe(true)
  })

  test('broad-audit: production-readiness assessment of this codebase', () => {
    const result = classifyBreadth(PRODUCTION_READY_AUDIT_PROMPT)
    expect(result.kind).toBe('broad-audit')
    expect(result.hasBreadthMarker).toBe(true)
    expect(result.hasSingleFileTarget).toBe(false)
  })

  test('single-target: explicit path literal', () => {
    const result = classifyBreadth('Review src/foo.ts for bugs')
    expect(result.kind).toBe('single-target')
    expect(result.hasSingleFileTarget).toBe(true)
  })

  test('single-target: "in <file>" phrasing', () => {
    const result = classifyBreadth('Find issues in agents/base2/base2.ts')
    expect(result.kind).toBe('single-target')
    expect(result.hasSingleFileTarget).toBe(true)
  })

  test('single-target: "the file <path>" phrasing', () => {
    const result = classifyBreadth(
      'Review the file agents/patterns/audit-codebase.md',
    )
    expect(result.kind).toBe('single-target')
    expect(result.hasSingleFileTarget).toBe(true)
  })

  test('single-target wins over breadth markers', () => {
    // Even with a breadth marker, an explicit file target makes it single-target.
    const result = classifyBreadth(
      'Audit the whole codebase but focus on src/config.ts',
    )
    expect(result.kind).toBe('single-target')
    expect(result.hasSingleFileTarget).toBe(true)
    expect(result.hasBreadthMarker).toBe(true)
  })

  test('unclear: 1-2 domains, no marker, no file', () => {
    const result = classifyBreadth('Check the sdk for correctness issues')
    expect(result.kind).toBe('unclear')
    expect(result.domainCount).toBe(1)
    expect(result.domains).toEqual(['sdk'])
    expect(result.hasBreadthMarker).toBe(false)
    expect(result.hasSingleFileTarget).toBe(false)
  })

  test('unclear: no domains, no marker, no file', () => {
    const result = classifyBreadth('Help me understand this project')
    expect(result.kind).toBe('unclear')
    expect(result.domainCount).toBe(0)
    expect(result.domains).toEqual([])
  })

  test('domains are de-duplicated and sorted', () => {
    const result = classifyBreadth('Audit the sdk, the cli, and the sdk again')
    expect(result.domains).toEqual(['cli', 'sdk'])
    expect(result.domainCount).toBe(2)
  })

  test('case-insensitive domain matching', () => {
    const result = classifyBreadth('Audit the AGENTS, SDK, and CLI modules')
    expect(result.kind).toBe('broad-audit')
    expect(result.domains).toEqual(['agents', 'cli', 'sdk'])
    expect(result.domainCount).toBe(3)
  })

  test('broad-audit: conceptual context/indexing/UX request maps to repo domains', () => {
    const result = classifyBreadth(
      'Audit our context, indexing and general ability to gather context effectively for feature gaps, feature improvements and ux flow issues.',
    )

    expect(result.kind).toBe('broad-audit')
    expect(result.domains).toEqual(
      expect.arrayContaining(['cli', 'indexer', 'runtime']),
    )
    expect(result.hasBreadthMarker).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// extractSpawnAgentsCalls
// ---------------------------------------------------------------------------

describe('extractSpawnAgentsCalls', () => {
  test('extracts a single top-level spawn_agents call', () => {
    const events: PrintModeEvent[] = [
      spawnAgentsCall([
        { agent_type: 'file-picker', prompt: 'a' },
        { agent_type: 'code-searcher', prompt: 'b' },
      ]),
    ]
    const calls = extractSpawnAgentsCalls(events)
    expect(calls).toHaveLength(1)
    expect(calls[0].agentCount).toBe(2)
    expect(calls[0].agentTypes).toEqual(['file-picker', 'code-searcher'])
  })

  test('ignores nested spawn_agents calls (parentAgentId set)', () => {
    const events: PrintModeEvent[] = [
      spawnAgentsCall([{ agent_type: 'editor', prompt: 'x' }], {
        parentAgentId: 'sub-1',
      }),
    ]
    expect(extractSpawnAgentsCalls(events)).toEqual([])
  })

  test('ignores non-spawn_agents tool calls', () => {
    const events: PrintModeEvent[] = [
      toolCall('code_search', { pattern: 'foo' }),
      toolCall('read_files', { paths: ['a.ts'] }),
    ]
    expect(extractSpawnAgentsCalls(events)).toEqual([])
  })

  test('handles malformed/missing agents array gracefully', () => {
    const events: PrintModeEvent[] = [
      toolCall('spawn_agents', {}),
      toolCall('spawn_agents', { agents: 'not-an-array' }),
      toolCall('spawn_agents', { agents: [{ prompt: 'no type' }] }),
    ]
    const calls = extractSpawnAgentsCalls(events)
    expect(calls).toHaveLength(3)
    expect(calls[0].agentCount).toBe(0)
    expect(calls[1].agentCount).toBe(0)
    expect(calls[2].agentCount).toBe(1)
    expect(calls[2].agentTypes).toEqual([])
  })

  test('collects multiple top-level spawn_agents calls in order', () => {
    const events: PrintModeEvent[] = [
      spawnAgentsCall([{ agent_type: 'file-picker', prompt: 'a' }]),
      spawnAgentsCall([
        { agent_type: 'code-searcher', prompt: 'b' },
        { agent_type: 'researcher-docs', prompt: 'c' },
      ]),
    ]
    const calls = extractSpawnAgentsCalls(events)
    expect(calls).toHaveLength(2)
    expect(calls[0].agentCount).toBe(1)
    expect(calls[1].agentCount).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// extractSubagentStarts
// ---------------------------------------------------------------------------

describe('extractSubagentStarts', () => {
  test('extracts top-level subagent_start records', () => {
    const events: PrintModeEvent[] = [
      subagentStart({ agentId: 's1', agentType: 'file-picker' }),
      subagentStart({ agentId: 's2', agentType: 'code-searcher' }),
    ]
    const starts = extractSubagentStarts(events)
    expect(starts).toHaveLength(2)
    expect(starts[0]).toEqual({
      agentId: 's1',
      agentType: 'file-picker',
      onlyChild: false,
      parentAgentId: undefined,
    })
  })

  test('ignores nested subagent_start events (parentAgentId set)', () => {
    const events: PrintModeEvent[] = [
      subagentStart({ agentId: 'nested', parentAgentId: 's1' }),
    ]
    expect(extractSubagentStarts(events)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// computePlanShardingSignals
// ---------------------------------------------------------------------------

describe('computePlanShardingSignals', () => {
  test('returns empty/zero signals for an empty trace', () => {
    const s = computePlanShardingSignals({ events: [], prompt: AUDIT_PROMPT })
    expect(s.spawnAgentsCallCount).toBe(0)
    expect(s.totalRequestedAgents).toBe(0)
    expect(s.maxBatchSize).toBe(0)
    expect(s.distinctAgentTypes).toEqual([])
    expect(s.subagentStarts).toEqual([])
    expect(s.peakConcurrency).toBe(0)
    expect(s.shardedParallely).toBe(false)
    expect(s.singleCodesearchOnly).toBe(false)
    expect(s.topLevelDirectToolCount).toBe(0)
    expect(s.promptKind).toBe('audit')
  })

  test('detects a single surface-level codesearch (anti-pattern)', () => {
    const events: PrintModeEvent[] = [
      toolCall('code_search', { pattern: 'feature' }),
    ]
    const s = computePlanShardingSignals({ events, prompt: AUDIT_PROMPT })
    expect(s.singleCodesearchOnly).toBe(true)
    expect(s.spawnAgentsCallCount).toBe(0)
    expect(s.subagentStarts).toHaveLength(0)
    expect(s.topLevelDirectToolCount).toBe(1)
  })

  test('detects parallel sharding via concurrent subagent starts', () => {
    const events: PrintModeEvent[] = [
      subagentStart({ agentId: 's1', agentType: 'file-picker' }),
      subagentStart({ agentId: 's2', agentType: 'code-searcher' }),
      subagentStart({ agentId: 's3', agentType: 'file-picker' }),
      subagentFinish({ agentId: 's1' }),
      subagentFinish({ agentId: 's2' }),
      subagentFinish({ agentId: 's3' }),
    ]
    const s = computePlanShardingSignals({ events, prompt: AUDIT_PROMPT })
    expect(s.peakConcurrency).toBe(3)
    expect(s.shardedParallely).toBe(true)
    expect(s.subagentStarts).toHaveLength(3)
    expect(s.singleCodesearchOnly).toBe(false)
  })

  test('detects batch sharding via a single spawn_agents call with 4 agents', () => {
    const events: PrintModeEvent[] = [
      spawnAgentsCall([
        { agent_type: 'file-picker', prompt: 'a' },
        { agent_type: 'file-picker', prompt: 'b' },
        { agent_type: 'code-searcher', prompt: 'c' },
        { agent_type: 'researcher-docs', prompt: 'd' },
      ]),
    ]
    const s = computePlanShardingSignals({ events, prompt: AUDIT_PROMPT })
    expect(s.maxBatchSize).toBe(4)
    expect(s.totalRequestedAgents).toBe(4)
    expect(s.requestedAgentTypes).toEqual([
      'file-picker',
      'file-picker',
      'code-searcher',
      'researcher-docs',
    ])
    expect(s.distinctAgentTypes).toEqual([
      'code-searcher',
      'file-picker',
      'researcher-docs',
    ])
  })

  test('peakConcurrency is 1 when subagents run sequentially', () => {
    const events: PrintModeEvent[] = [
      subagentStart({ agentId: 's1' }),
      subagentFinish({ agentId: 's1' }),
      subagentStart({ agentId: 's2' }),
      subagentFinish({ agentId: 's2' }),
    ]
    const s = computePlanShardingSignals({ events, prompt: AUDIT_PROMPT })
    expect(s.peakConcurrency).toBe(1)
    expect(s.shardedParallely).toBe(false)
  })

  test('classifies the prompt kind from the prompt string', () => {
    const s = computePlanShardingSignals({ events: [], prompt: IMPL_PROMPT })
    expect(s.promptKind).toBe('implementation')
  })
})

// ---------------------------------------------------------------------------
// evaluateShardingVerdict
// ---------------------------------------------------------------------------

describe('evaluateShardingVerdict', () => {
  test('pass: parallel subagent sharding for an audit prompt', () => {
    const events: PrintModeEvent[] = [
      subagentStart({ agentId: 's1', agentType: 'file-picker' }),
      subagentStart({ agentId: 's2', agentType: 'code-searcher' }),
      subagentFinish({ agentId: 's1' }),
      subagentFinish({ agentId: 's2' }),
    ]
    const signals = computePlanShardingSignals({ events, prompt: AUDIT_PROMPT })
    const eval_ = evaluateShardingVerdict(signals)
    expect(eval_.verdict).toBe('pass')
    expect(eval_.reasons[0]).toContain('Sharded')
  })

  test('pass: single spawn_agents call with >= 2 agents (batch sharding)', () => {
    const events: PrintModeEvent[] = [
      spawnAgentsCall([
        { agent_type: 'file-picker', prompt: 'a' },
        { agent_type: 'file-picker', prompt: 'b' },
        { agent_type: 'code-searcher', prompt: 'c' },
      ]),
    ]
    const signals = computePlanShardingSignals({ events, prompt: AUDIT_PROMPT })
    const eval_ = evaluateShardingVerdict(signals)
    expect(eval_.verdict).toBe('pass')
  })

  test('fail: single surface-level codesearch for an audit prompt', () => {
    const events: PrintModeEvent[] = [
      toolCall('code_search', { pattern: 'improvements' }),
    ]
    const signals = computePlanShardingSignals({ events, prompt: AUDIT_PROMPT })
    const eval_ = evaluateShardingVerdict(signals)
    expect(eval_.verdict).toBe('fail')
    expect(eval_.reasons.some((r) => r.includes('Anti-pattern'))).toBe(true)
  })

  test('fail: only one subagent started for an audit prompt', () => {
    const events: PrintModeEvent[] = [
      subagentStart({ agentId: 's1', agentType: 'file-picker' }),
      subagentFinish({ agentId: 's1' }),
    ]
    const signals = computePlanShardingSignals({ events, prompt: AUDIT_PROMPT })
    const eval_ = evaluateShardingVerdict(signals)
    expect(eval_.verdict).toBe('fail')
    expect(eval_.reasons.some((r) => r.includes('Only 1 subagent'))).toBe(true)
  })

  test('fail: no subagents and no spawn_agents calls for an audit prompt', () => {
    const events: PrintModeEvent[] = []
    const signals = computePlanShardingSignals({ events, prompt: AUDIT_PROMPT })
    const eval_ = evaluateShardingVerdict(signals)
    expect(eval_.verdict).toBe('fail')
    expect(eval_.reasons.some((r) => r.includes('No spawn_agents calls'))).toBe(
      true,
    )
  })

  test('skip: implementation prompt does not require sharding', () => {
    const events: PrintModeEvent[] = [toolCall('str_replace', {})]
    const signals = computePlanShardingSignals({ events, prompt: IMPL_PROMPT })
    const eval_ = evaluateShardingVerdict(signals)
    expect(eval_.verdict).toBe('skip')
    expect(eval_.reasons[0]).toContain('implementation')
  })

  test('skip: question prompt does not require sharding', () => {
    const events: PrintModeEvent[] = []
    const signals = computePlanShardingSignals({
      events,
      prompt: QUESTION_PROMPT,
    })
    const eval_ = evaluateShardingVerdict(signals)
    expect(eval_.verdict).toBe('skip')
  })

  test('ambiguous prompt still evaluated (not skipped)', () => {
    const events: PrintModeEvent[] = [
      subagentStart({ agentId: 's1' }),
      subagentStart({ agentId: 's2' }),
      subagentFinish({ agentId: 's1' }),
      subagentFinish({ agentId: 's2' }),
    ]
    const signals = computePlanShardingSignals({
      events,
      prompt: 'do the thing properly across the repo',
    })
    // 'do the thing properly across the repo' is > 20 chars and no ? → ambiguous
    expect((signals.promptKind as PromptKind) === 'ambiguous').toBe(true)
    const eval_ = evaluateShardingVerdict(signals)
    // Ambiguous prompts are still evaluated, not skipped.
    expect(eval_.verdict).not.toBe('skip')
  })
})

// ---------------------------------------------------------------------------
// evaluateMinimumShardRule
// ---------------------------------------------------------------------------

/**
 * Build a sharding trace with `filePickers` file-picker subagent_start events
 * and `codeSearchers` code-searcher subagent_start events (no finishes → all
 * in-flight, so they count toward the sharding signals).
 */
function shardingEvents(
  filePickers: number,
  codeSearchers: number,
): PrintModeEvent[] {
  const events: PrintModeEvent[] = []
  for (let i = 0; i < filePickers; i++) {
    events.push(subagentStart({ agentId: `fp-${i}`, agentType: 'file-picker' }))
  }
  for (let i = 0; i < codeSearchers; i++) {
    events.push(
      subagentStart({ agentId: `cs-${i}`, agentType: 'code-searcher' }),
    )
  }
  return events
}

const BROAD_AUDIT_3_DOMAINS =
  'Audit the agents, sdk, and cli subsystems for issues'
const BROAD_AUDIT_5_DOMAINS =
  'Audit the agents, sdk, cli, common, and evals subsystems'
const BROAD_AUDIT_7_DOMAINS =
  'Audit the agents, sdk, cli, common, evals, docs, and scripts subsystems'

describe('evaluateMinimumShardRule', () => {
  test('satisfies: 5 pairs for a 3-domain broad-audit (max(3,5)=5)', () => {
    const breadth = classifyBreadth(BROAD_AUDIT_3_DOMAINS)
    expect(breadth.kind).toBe('broad-audit')
    expect(breadth.domainCount).toBe(3)
    const signals = computePlanShardingSignals({
      events: shardingEvents(5, 5),
      prompt: BROAD_AUDIT_3_DOMAINS,
    })
    const result: MinimumShardEvaluation = evaluateMinimumShardRule({
      signals,
      breadth,
    })
    expect(result.requiredPairs).toBe(5)
    expect(result.actualPairs).toBe(5)
    expect(result.filePickerCount).toBe(5)
    expect(result.codeSearcherCount).toBe(5)
    expect(result.satisfies).toBe(true)
    expect(result.reason).toContain('>=5 shard pairs')
  })

  test('satisfies: 7 pairs for a 7-domain broad-audit (max(7,5)=7)', () => {
    const breadth = classifyBreadth(BROAD_AUDIT_7_DOMAINS)
    expect(breadth.kind).toBe('broad-audit')
    expect(breadth.domainCount).toBe(7)
    const signals = computePlanShardingSignals({
      events: shardingEvents(7, 7),
      prompt: BROAD_AUDIT_7_DOMAINS,
    })
    const result = evaluateMinimumShardRule({ signals, breadth })
    expect(result.requiredPairs).toBe(7)
    expect(result.actualPairs).toBe(7)
    expect(result.satisfies).toBe(true)
    expect(result.reason).toContain('>=7 shard pairs')
  })

  test('violates: only 2 pairs for a 3-domain broad-audit (requires 5)', () => {
    const breadth = classifyBreadth(BROAD_AUDIT_3_DOMAINS)
    const signals = computePlanShardingSignals({
      events: shardingEvents(2, 2),
      prompt: BROAD_AUDIT_3_DOMAINS,
    })
    const result = evaluateMinimumShardRule({ signals, breadth })
    expect(result.requiredPairs).toBe(5)
    expect(result.actualPairs).toBe(2)
    expect(result.filePickerCount).toBe(2)
    expect(result.codeSearcherCount).toBe(2)
    expect(result.satisfies).toBe(false)
    expect(result.reason).toContain('only 2')
  })

  test('counts repeated spawn_agents agent types before subagent_start events', () => {
    const breadth = classifyBreadth(BROAD_AUDIT_3_DOMAINS)
    const events: PrintModeEvent[] = [
      spawnAgentsCall([
        ...Array.from({ length: 5 }, (_, index) => ({
          agent_type: 'file-picker',
          prompt: `file shard ${index}`,
        })),
        ...Array.from({ length: 5 }, (_, index) => ({
          agent_type: 'code-searcher',
          prompt: `search shard ${index}`,
        })),
      ]),
    ]
    const signals = computePlanShardingSignals({
      events,
      prompt: BROAD_AUDIT_3_DOMAINS,
    })
    const result = evaluateMinimumShardRule({ signals, breadth })
    expect(signals.filePickerCount).toBe(5)
    expect(signals.codeSearcherCount).toBe(5)
    expect(result.actualPairs).toBe(5)
    expect(result.satisfies).toBe(true)
  })

  test('violates: has file-pickers but no code-searchers (actualPairs=0)', () => {
    const breadth = classifyBreadth(BROAD_AUDIT_3_DOMAINS)
    const signals = computePlanShardingSignals({
      events: shardingEvents(5, 0),
      prompt: BROAD_AUDIT_3_DOMAINS,
    })
    const result = evaluateMinimumShardRule({ signals, breadth })
    expect(result.filePickerCount).toBe(5)
    expect(result.codeSearcherCount).toBe(0)
    expect(result.actualPairs).toBe(0)
    expect(result.satisfies).toBe(false)
    expect(result.reason).toContain('code-searcher=0')
  })

  test('violates: has code-searchers but no file-pickers (actualPairs=0)', () => {
    const breadth = classifyBreadth(BROAD_AUDIT_3_DOMAINS)
    const signals = computePlanShardingSignals({
      events: shardingEvents(0, 5),
      prompt: BROAD_AUDIT_3_DOMAINS,
    })
    const result = evaluateMinimumShardRule({ signals, breadth })
    expect(result.filePickerCount).toBe(0)
    expect(result.codeSearcherCount).toBe(5)
    expect(result.actualPairs).toBe(0)
    expect(result.satisfies).toBe(false)
    expect(result.reason).toContain('file-picker=0')
  })

  test('vacuously satisfied for single-target breadth', () => {
    const breadth = classifyBreadth('Review src/foo.ts for bugs')
    expect(breadth.kind).toBe('single-target')
    const signals = computePlanShardingSignals({
      events: shardingEvents(0, 0),
      prompt: 'Review src/foo.ts for bugs',
    })
    const result = evaluateMinimumShardRule({ signals, breadth })
    expect(result.requiredPairs).toBe(0)
    expect(result.actualPairs).toBe(0)
    expect(result.satisfies).toBe(true)
    expect(result.reason).toContain('only applies to broad-audit')
  })

  test('vacuously satisfied for unclear breadth', () => {
    const breadth = classifyBreadth('Check the sdk for correctness issues')
    expect(breadth.kind).toBe('unclear')
    const signals = computePlanShardingSignals({
      events: shardingEvents(0, 0),
      prompt: 'Check the sdk for correctness issues',
    })
    const result = evaluateMinimumShardRule({ signals, breadth })
    expect(result.requiredPairs).toBe(0)
    expect(result.actualPairs).toBe(0)
    expect(result.satisfies).toBe(true)
    expect(result.reason).toContain('only applies to broad-audit')
  })

  test('wire-through: downgrades pass->fail when min-shard not met (5 domains, 1 pair)', () => {
    const signals = computePlanShardingSignals({
      events: shardingEvents(1, 1),
      prompt: BROAD_AUDIT_5_DOMAINS,
    })
    // Base sharding check passes (2 subagents, peak concurrency 2) when the
    // min-shard gate is not engaged (single-arg, backward-compatible call).
    const withoutMinShard = evaluateShardingVerdict(signals)
    expect(withoutMinShard.verdict).toBe('pass')
    // Supplying the prompt engages the min-shard gate (5 domains → 5 required
    // pairs, but only 1 actual pair), which downgrades pass to fail.
    const withMinShard = evaluateShardingVerdict(signals, BROAD_AUDIT_5_DOMAINS)
    expect(withMinShard.verdict).toBe('fail')
    expect(
      withMinShard.reasons.some((r) =>
        r.includes('Minimum-shard rule (M10.2) violated'),
      ),
    ).toBe(true)
  })

  test('wire-through: stays pass when min-shard met (3 domains, 5 pairs)', () => {
    const signals = computePlanShardingSignals({
      events: shardingEvents(5, 5),
      prompt: BROAD_AUDIT_3_DOMAINS,
    })
    const result = evaluateShardingVerdict(signals, BROAD_AUDIT_3_DOMAINS)
    expect(result.verdict).toBe('pass')
  })

  test('wire-through: production-readiness audit requires broad-audit minimum shards', () => {
    const breadth = classifyBreadth(PRODUCTION_READY_AUDIT_PROMPT)
    expect(breadth.kind).toBe('broad-audit')
    expect(breadth.domainCount).toBe(0)

    const signals = computePlanShardingSignals({
      events: shardingEvents(1, 1),
      prompt: PRODUCTION_READY_AUDIT_PROMPT,
    })
    expect(signals.promptKind).toBe('audit')

    const result = evaluateShardingVerdict(
      signals,
      PRODUCTION_READY_AUDIT_PROMPT,
    )
    expect(result.verdict).toBe('fail')
    expect(
      result.reasons.some((r) =>
        r.includes('Minimum-shard rule (M10.2) violated'),
      ),
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// buildCoverageMatrix
// ---------------------------------------------------------------------------

describe('buildCoverageMatrix', () => {
  test('satisfies: all covered when actualPairs >= domainCount (3 domains, 5 pairs)', () => {
    const breadth = classifyBreadth(BROAD_AUDIT_3_DOMAINS)
    expect(breadth.kind).toBe('broad-audit')
    expect(breadth.domainCount).toBe(3)
    const signals = computePlanShardingSignals({
      events: shardingEvents(5, 5),
      prompt: BROAD_AUDIT_3_DOMAINS,
    })
    const matrix: CoverageMatrix = buildCoverageMatrix({ breadth, signals })
    expect(matrix.entries).toHaveLength(3)
    expect(matrix.uncoveredDomains).toEqual([])
    expect(matrix.allCovered).toBe(true)
    // 5 pairs across 3 domains: 2,2,1 round-robin.
    expect(matrix.entries.map((e) => e.assignedPairs)).toEqual([2, 2, 1])
    expect(matrix.entries.every((e) => e.covered)).toBe(true)
  })

  test('satisfies: all covered when actualPairs === domainCount (7 domains, 7 pairs)', () => {
    const breadth = classifyBreadth(BROAD_AUDIT_7_DOMAINS)
    expect(breadth.kind).toBe('broad-audit')
    expect(breadth.domainCount).toBe(7)
    const signals = computePlanShardingSignals({
      events: shardingEvents(7, 7),
      prompt: BROAD_AUDIT_7_DOMAINS,
    })
    const matrix = buildCoverageMatrix({ breadth, signals })
    expect(matrix.entries).toHaveLength(7)
    expect(matrix.uncoveredDomains).toEqual([])
    expect(matrix.allCovered).toBe(true)
    expect(matrix.entries.every((e) => e.assignedPairs === 1)).toBe(true)
  })

  test('has uncovered domains when actualPairs < domainCount (5 domains, 3 pairs -> 2 uncovered)', () => {
    const breadth = classifyBreadth(BROAD_AUDIT_5_DOMAINS)
    expect(breadth.kind).toBe('broad-audit')
    expect(breadth.domainCount).toBe(5)
    const signals = computePlanShardingSignals({
      events: shardingEvents(3, 3),
      prompt: BROAD_AUDIT_5_DOMAINS,
    })
    const matrix = buildCoverageMatrix({ breadth, signals })
    expect(matrix.entries).toHaveLength(5)
    // 3 pairs across 5 domains: first 3 covered, last 2 uncovered.
    expect(matrix.uncoveredDomains).toHaveLength(2)
    expect(matrix.allCovered).toBe(false)
    expect(matrix.entries.slice(0, 3).every((e) => e.assignedPairs === 1)).toBe(
      true,
    )
    expect(matrix.entries.slice(3).every((e) => e.assignedPairs === 0)).toBe(
      true,
    )
  })

  test('vacuously satisfied for single-target breadth', () => {
    const breadth = classifyBreadth('Review src/foo.ts for bugs')
    expect(breadth.kind).toBe('single-target')
    const signals = computePlanShardingSignals({
      events: shardingEvents(5, 5),
      prompt: 'Review src/foo.ts for bugs',
    })
    const matrix = buildCoverageMatrix({ breadth, signals })
    expect(matrix.entries).toEqual([])
    expect(matrix.uncoveredDomains).toEqual([])
    expect(matrix.allCovered).toBe(true)
  })

  test('vacuously satisfied for unclear breadth', () => {
    const breadth = classifyBreadth('Check the sdk for correctness issues')
    expect(breadth.kind).toBe('unclear')
    const signals = computePlanShardingSignals({
      events: shardingEvents(5, 5),
      prompt: 'Check the sdk for correctness issues',
    })
    const matrix = buildCoverageMatrix({ breadth, signals })
    expect(matrix.entries).toEqual([])
    expect(matrix.allCovered).toBe(true)
  })

  test('entries sorted alphabetically by domain', () => {
    const breadth = classifyBreadth(BROAD_AUDIT_5_DOMAINS)
    const signals = computePlanShardingSignals({
      events: shardingEvents(5, 5),
      prompt: BROAD_AUDIT_5_DOMAINS,
    })
    const matrix = buildCoverageMatrix({ breadth, signals })
    const domains = matrix.entries.map((e) => e.domain)
    const sorted = [...domains].sort()
    expect(domains).toEqual(sorted)
  })

  test('round-robin assignment: domain[0] gets the extra pair when actualPairs > domainCount', () => {
    const breadth = classifyBreadth(BROAD_AUDIT_3_DOMAINS)
    const signals = computePlanShardingSignals({
      events: shardingEvents(7, 7),
      prompt: BROAD_AUDIT_3_DOMAINS,
    })
    const matrix = buildCoverageMatrix({ breadth, signals })
    // 7 pairs across 3 domains: 3,2,2 round-robin (first domain gets the extra).
    expect(matrix.entries.map((e) => e.assignedPairs)).toEqual([3, 2, 2])
    expect(matrix.entries[0].domain).toBe(matrix.entries[0].domain)
  })
})

// ---------------------------------------------------------------------------
// Planner-output coverage
// ---------------------------------------------------------------------------

describe('buildPlannerOutputCoverage', () => {
  test('requires planner text to mention broad-audit domains', () => {
    const breadth = classifyBreadth(BROAD_AUDIT_5_DOMAINS)
    expect(breadth.kind).toBe('broad-audit')
    const coverage: PlannerOutputCoverage = buildPlannerOutputCoverage({
      breadth,
      events: [
        textEvent('I will audit agents, cli, and sdk.'),
        toolCall('spawn_agents', { agents: [] }),
      ],
    })
    expect(coverage.entries).toHaveLength(5)
    expect(coverage.uncoveredDomains).toEqual(['common', 'evals'])
    expect(coverage.allCovered).toBe(false)
  })

  test('does not count domains that appear only in the prompt', () => {
    const breadth = classifyBreadth(BROAD_AUDIT_3_DOMAINS)
    const coverage = buildPlannerOutputCoverage({
      breadth,
      events: [textEvent('I will inspect the repository broadly.')],
    })
    expect(coverage.uncoveredDomains).toEqual(['agents', 'cli', 'sdk'])
  })

  test('vacuously satisfied for non-broad breadth', () => {
    const breadth = classifyBreadth('Review src/foo.ts for bugs')
    const coverage = buildPlannerOutputCoverage({
      breadth,
      events: [textEvent('agents cli sdk')],
    })
    expect(coverage.entries).toEqual([])
    expect(coverage.uncoveredDomains).toEqual([])
    expect(coverage.allCovered).toBe(true)
  })
})

describe('evaluatePlannerOutputCoverage', () => {
  test('downgrades pass to fail when planner output misses domains', () => {
    const signals = computePlanShardingSignals({
      events: shardingEvents(5, 5),
      prompt: BROAD_AUDIT_3_DOMAINS,
    })
    const baseEvaluation = evaluateShardingVerdict(
      signals,
      BROAD_AUDIT_3_DOMAINS,
    )
    expect(baseEvaluation.verdict).toBe('pass')

    const result = evaluatePlannerOutputCoverage({
      evaluation: baseEvaluation,
      breadth: classifyBreadth(BROAD_AUDIT_3_DOMAINS),
      events: [textEvent('I will audit agents and sdk.')],
    })
    expect(result.verdict).toBe('fail')
    expect(
      result.reasons.some((reason) =>
        reason.includes('Planner-output coverage (M10.3) missing domains: cli'),
      ),
    ).toBe(true)
  })

  test('preserves pass when planner output covers every domain', () => {
    const signals = computePlanShardingSignals({
      events: shardingEvents(5, 5),
      prompt: BROAD_AUDIT_3_DOMAINS,
    })
    const baseEvaluation = evaluateShardingVerdict(
      signals,
      BROAD_AUDIT_3_DOMAINS,
    )
    const result = evaluatePlannerOutputCoverage({
      evaluation: baseEvaluation,
      breadth: classifyBreadth(BROAD_AUDIT_3_DOMAINS),
      events: [textEvent('Coverage plan: agents, cli, and sdk.')],
    })
    expect(result.verdict).toBe('pass')
    expect(result.reasons).toEqual(baseEvaluation.reasons)
  })
})

// ---------------------------------------------------------------------------
// evaluateSubsystemEnumeration
// ---------------------------------------------------------------------------

describe('evaluateSubsystemEnumeration', () => {
  test('satisfies: all top-level dirs in breadth.domains (broad-audit)', () => {
    const breadth = classifyBreadth(BROAD_AUDIT_5_DOMAINS)
    expect(breadth.kind).toBe('broad-audit')
    // breadth.domains for BROAD_AUDIT_5_DOMAINS: agents, cli, common, evals, sdk
    const result: SubsystemEnumeration = evaluateSubsystemEnumeration({
      breadth,
      topLevelDirs: ['agents', 'cli', 'sdk', 'common', 'evals'],
    })
    expect(result.auditedDirs).toHaveLength(5)
    expect(result.unenumeratedDirs).toEqual([])
    expect(result.satisfies).toBe(true)
  })

  test('has unenumerated dirs when breadth.domains misses some (broad-audit)', () => {
    const breadth = classifyBreadth(BROAD_AUDIT_3_DOMAINS)
    expect(breadth.kind).toBe('broad-audit')
    const result = evaluateSubsystemEnumeration({
      breadth,
      topLevelDirs: ['agents', 'cli', 'sdk', 'common', 'docs'],
    })
    // common + docs are NOT in the 3-domain prompt (agents, cli, sdk).
    expect(result.auditedDirs).toEqual(['agents', 'cli', 'sdk'])
    expect(result.unenumeratedDirs).toEqual(['common', 'docs'])
    expect(result.satisfies).toBe(false)
  })

  test('case-insensitive: domains matched case-insensitively against topLevelDirs', () => {
    const breadth = classifyBreadth(BROAD_AUDIT_3_DOMAINS)
    expect(breadth.kind).toBe('broad-audit')
    const result = evaluateSubsystemEnumeration({
      breadth,
      topLevelDirs: ['Agents', 'CLI', 'SDK'],
    })
    expect(result.auditedDirs).toEqual(['Agents', 'CLI', 'SDK'])
    expect(result.unenumeratedDirs).toEqual([])
    expect(result.satisfies).toBe(true)
  })

  test('vacuously satisfied for single-target breadth', () => {
    const breadth = classifyBreadth('Review src/foo.ts for bugs')
    expect(breadth.kind).toBe('single-target')
    const result = evaluateSubsystemEnumeration({
      breadth,
      topLevelDirs: ['agents', 'cli', 'sdk'],
    })
    expect(result.auditedDirs).toEqual([])
    expect(result.unenumeratedDirs).toEqual([])
    expect(result.satisfies).toBe(true)
  })

  test('vacuously satisfied for unclear breadth', () => {
    const breadth = classifyBreadth('Check the sdk for correctness issues')
    expect(breadth.kind).toBe('unclear')
    const result = evaluateSubsystemEnumeration({
      breadth,
      topLevelDirs: ['agents', 'cli', 'sdk'],
    })
    expect(result.auditedDirs).toEqual([])
    expect(result.unenumeratedDirs).toEqual([])
    expect(result.satisfies).toBe(true)
  })
})
