import { describe, expect, it } from 'bun:test'

import { spawnAgentsParams } from '../params/tool/spawn-agents'

describe('spawn_agents handoff schema', () => {
  it('accepts string context for model-generated handoffs', () => {
    const result = spawnAgentsParams.inputSchema.safeParse({
      agents: [
        {
          agent_type: 'editor',
          prompt: 'Implement the requested change.',
          handoff: { context: 'Use the existing dashboard patterns.' },
        },
      ],
    })

    expect(result.success).toBe(true)
  })

  it('accepts compact file evidence with freshness metadata', () => {
    const result = spawnAgentsParams.inputSchema.safeParse({
      agents: [
        {
          agent_type: 'editor',
          handoff: {
            schemaVersion: 1,
            taskId: 'T1',
            role: 'editor',
            objective: 'Update the runtime safely.',
            requirements: [],
            acceptanceCriteria: [],
            context: [
              {
                path: 'src/runtime.ts',
                symbols: ['run'],
                reason: 'Primary implementation path',
                confidence: 'confirmed',
                freshnessHash: 'sha256:abc',
              },
            ],
            nonGoals: [],
            findings: [],
            permissions: {
              readablePaths: ['src/runtime.ts'],
              writablePaths: ['src/runtime.ts'],
              allowedTools: ['read_files', 'str_replace'],
            },
          },
        },
      ],
    })

    expect(result.success).toBe(true)
  })

  it('repairs double-stringified lists and stringified agent entries', () => {
    const entry = {
      agent_type: 'code-searcher',
      params: {
        searchQueries: [{ pattern: 'authenticate', flags: ['-g', '*.ts'] }],
      },
    }
    for (const agents of [
      JSON.stringify(JSON.stringify([entry])),
      [JSON.stringify(entry)],
    ]) {
      const result = spawnAgentsParams.inputSchema.safeParse({ agents })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.agents).toEqual([entry])
    }
  })

  it('repairs a JSON-stringified agent-specific array inside params', () => {
    const result = spawnAgentsParams.inputSchema.safeParse({
      agents: [
        {
          agent_type: 'code-searcher',
          params: {
            searchQueries: JSON.stringify([
              { pattern: 'Helmet', flags: "-g '*.tsx'" },
            ]),
          },
        },
      ],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.agents[0]?.params?.searchQueries).toEqual([
        { pattern: 'Helmet', flags: "-g '*.tsx'" },
      ])
    }
  })
})
