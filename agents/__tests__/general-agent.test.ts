import { describe, expect, test } from 'bun:test'

import { createGeneralAgent } from '../general-agent/general-agent'

describe('general-agent programmatic tools', () => {
  test('declares the hidden context-pruner tool used by handleSteps', () => {
    const agent = createGeneralAgent({ model: 'opus' })

    expect(agent.programmaticToolNames).toContain('spawn_agent_inline')
    expect(agent.spawnableAgents).toContain('context-pruner')
  })
})
