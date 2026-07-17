import { describe, expect, test } from 'bun:test'

import { createGeneralAgent } from '../general-agent/general-agent'

describe('general-agent programmatic tools', () => {
  test('declares the hidden context-pruner tool used by handleSteps', () => {
    const agent = createGeneralAgent({ model: 'opus' })

    expect(agent.programmaticToolNames).toContain('spawn_agent_inline')
    expect(agent.spawnableAgents).toContain('context-pruner')
  })

  test('binds durable audit shards to composable snapshot receipts', () => {
    const agent = createGeneralAgent({ model: 'opus' })
    const params = agent.inputSchema?.params?.properties

    expect(params).toHaveProperty('snapshotId')
    expect(agent.instructionsPrompt).toContain(
      'copy it into write_audit_findings.snapshotId',
    )
    expect(agent.instructionsPrompt).toContain('structuralReceipt')
  })
})
