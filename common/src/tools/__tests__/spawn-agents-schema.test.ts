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
})
