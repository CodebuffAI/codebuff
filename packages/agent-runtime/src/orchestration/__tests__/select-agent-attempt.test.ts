import { describe, expect, test } from 'bun:test'

import { selectAgentAttempt } from '../select-agent-attempt'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'

function template(
  id: string,
  overrides: Partial<AgentTemplate> = {},
): AgentTemplate {
  return {
    id,
    displayName: id,
    toolNames: ['read_files'],
    spawnableAgents: [],
    mcpServers: {},
    systemPrompt: '',
    instructionsPrompt: '',
    stepPrompt: '',
    includeMessageHistory: false,
    inheritParentSystemPrompt: false,
    outputMode: 'last_message',
    inputSchema: {},
    ...overrides,
  } as AgentTemplate
}

const baseParams = {
  requiredTools: ['read_files'],
  requiredWritablePaths: [] as string[],
  runningForRoot: 0,
  maxRunningForRoot: 4,
}

describe('selectAgentAttempt', () => {
  test('rejects candidates missing a required tool or writable path', () => {
    const selection = selectAgentAttempt({
      ...baseParams,
      requiredTools: ['read_files', 'write_file'],
      requiredWritablePaths: ['src/a.ts'],
      candidates: [
        {
          template: template('missing-tool', {
            filesystemScope: { write: ['src/**'] },
          }),
        },
        {
          template: template('wrong-scope', {
            toolNames: ['read_files', 'write_file'],
            filesystemScope: { write: ['docs/**'] },
          }),
        },
        {
          template: template('eligible', {
            toolNames: ['read_files', 'write_file'],
            filesystemScope: { write: ['src/**'] },
          }),
        },
      ],
    })

    expect(selection.candidate.template.id).toBe('eligible')
    expect(selection.alternatives).toEqual([
      { agentId: 'missing-tool', rejectedReasons: ['missing tools: write_file'] },
      {
        agentId: 'wrong-scope',
        rejectedReasons: ['writable scope excludes: src/a.ts'],
      },
      { agentId: 'eligible', rejectedReasons: [] },
    ])
  })

  test('rejects candidates below the minimum context window', () => {
    expect(() =>
      selectAgentAttempt({
        ...baseParams,
        minimumContextTokens: 32_000,
        candidates: [
          { template: template('small'), contextWindowTokens: 16_000 },
        ],
      }),
    ).toThrow('context window 16000 < required 32000')
  })

  test('fails closed when a required minimum has no known context window', () => {
    expect(() =>
      selectAgentAttempt({
        ...baseParams,
        minimumContextTokens: 32_000,
        candidates: [{ template: template('unknown-window') }],
      }),
    ).toThrow('context window is unknown; required 32000')
  })

  test('enforces the root scheduling quota before ranking', () => {
    expect(() =>
      selectAgentAttempt({
        ...baseParams,
        runningForRoot: 4,
        candidates: [{ template: template('agent') }],
      }),
    ).toThrow('quota exceeded (4/4')
  })

  test('uses deterministic reliability, cost, latency, and id ranking', () => {
    const selection = selectAgentAttempt({
      ...baseParams,
      candidates: [
        {
          template: template('z-agent'),
          reliabilityScore: 0.9,
          estimatedCostScore: 2,
          latencyScore: 2,
        },
        {
          template: template('b-agent'),
          reliabilityScore: 0.9,
          estimatedCostScore: 1,
          latencyScore: 1,
        },
        {
          template: template('a-agent'),
          reliabilityScore: 0.9,
          estimatedCostScore: 1,
          latencyScore: 1,
        },
      ],
    })

    expect(selection.candidate.template.id).toBe('a-agent')
  })

  test('preserves an eligible explicit route ahead of scored alternatives', () => {
    const selection = selectAgentAttempt({
      ...baseParams,
      candidates: [
        {
          template: template('best-score'),
          reliabilityScore: 1,
          estimatedCostScore: 0,
        },
        {
          template: template('configured-route'),
          reliabilityScore: 0,
          estimatedCostScore: 10,
          explicitRoute: true,
        },
      ],
    })

    expect(selection.candidate.template.id).toBe('configured-route')
    expect(selection.reasons[0]).toContain('explicit configured')
  })

  test('distinguishes unrestricted and explicitly denied capability ids', () => {
    const unrestricted = selectAgentAttempt({
      ...baseParams,
      candidates: [{ template: template('same-agent') }],
    })
    const denied = selectAgentAttempt({
      ...baseParams,
      candidates: [
        {
          template: template('same-agent', {
            filesystemScope: { read: [], write: [] },
          }),
        },
      ],
    })

    expect(unrestricted.capabilityId).not.toBe(denied.capabilityId)
  })
})
