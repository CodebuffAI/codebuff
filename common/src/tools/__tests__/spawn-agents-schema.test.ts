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

  it('repairs double-stringified lists and stringified agent entries', () => {
    const entry = {
      agent_type: 'code-searcher',
      params: {
        searchQueries: [
          { pattern: 'authenticate', flags: ['-g', '*.ts'] },
        ],
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
})
