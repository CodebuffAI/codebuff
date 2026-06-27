import { expect, describe, test } from 'bun:test'

import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

import {
  classifyPrompt,
  extractSpawnAgentsCalls,
  extractSubagentStarts,
  computePlanShardingSignals,
  evaluateShardingVerdict,
  type PromptKind,
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
    toolCallId: overrides.toolCallId ?? `tc-${Math.random().toString(36).slice(2, 8)}`,
    toolName,
    input,
    parentAgentId: overrides.parentAgentId,
  } as PrintModeEvent
}

function spawnAgentsCall(
  agents: Array<{ agent_type: string; prompt: string; params?: Record<string, unknown> }>,
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
    agentId: overrides.agentId ?? `sub-${Math.random().toString(36).slice(2, 8)}`,
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

const AUDIT_PROMPT =
  'Audit this codebase for any feature improvements that can be made.'
const IMPL_PROMPT = 'Implement a login form with email and password fields.'
const QUESTION_PROMPT = 'How does the config loader resolve relative paths?'
const SHORT_PROMPT = 'do the thing'

// ---------------------------------------------------------------------------
// classifyPrompt
// ---------------------------------------------------------------------------

describe('classifyPrompt', () => {
  test('classifies audit-style prompts as audit', () => {
    expect(classifyPrompt(AUDIT_PROMPT)).toBe('audit')
    expect(classifyPrompt('Please review the codebase for technical debt.')).toBe('audit')
    expect(classifyPrompt('check this codebase for any issues')).toBe('audit')
    expect(classifyPrompt('Run a codebase audit for security review.')).toBe('audit')
  })

  test('classifies implementation prompts as implementation', () => {
    expect(classifyPrompt(IMPL_PROMPT)).toBe('implementation')
    expect(classifyPrompt('Fix the bug in the auth module.')).toBe('implementation')
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
      spawnAgentsCall(
        [{ agent_type: 'editor', prompt: 'x' }],
        { parentAgentId: 'sub-1' },
      ),
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
    expect(
      eval_.reasons.some((r) => r.includes('Only 1 subagent')),
    ).toBe(true)
  })

  test('fail: no subagents and no spawn_agents calls for an audit prompt', () => {
    const events: PrintModeEvent[] = []
    const signals = computePlanShardingSignals({ events, prompt: AUDIT_PROMPT })
    const eval_ = evaluateShardingVerdict(signals)
    expect(eval_.verdict).toBe('fail')
    expect(
      eval_.reasons.some((r) => r.includes('No spawn_agents calls')),
    ).toBe(true)
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