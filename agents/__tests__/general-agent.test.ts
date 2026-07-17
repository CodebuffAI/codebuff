import { describe, expect, test } from 'bun:test'

import { createGeneralAgent } from '../general-agent/general-agent'

describe('general-agent programmatic tools', () => {
  test('declares the hidden context-pruner tool used by handleSteps', () => {
    const agent = createGeneralAgent({ model: 'opus' })

    expect(agent.programmaticToolNames).toContain('spawn_agent_inline')
    expect(agent.spawnableAgents).toContain('context-pruner')
    expect(agent.toolNames).toContain('task_completed')
  })

  test('routes directory-like bootstrap paths through read_subtree', () => {
    const agent = createGeneralAgent({ model: 'opus' })
    const generator = agent.handleSteps!({
      prompt: 'Audit the server subsystem',
      params: {
        filePaths: ['server/src/services', 'server/src/worker.ts'],
        directoryPaths: ['server/src/integrations'],
      },
    } as any)

    expect(generator.next().value).toEqual({
      toolName: 'read_subtree',
      input: {
        paths: ['server/src/integrations', 'server/src/services'],
        maxTokens: 10_000,
      },
    })
    expect(generator.next({ toolResult: [] } as any).value).toEqual({
      toolName: 'read_files',
      input: { paths: ['server/src/worker.ts'] },
    })
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

  test('rejects audit completion without a structural receipt', () => {
    const agent = createGeneralAgent({ model: 'opus' })
    const generator = agent.handleSteps!({
      prompt: 'Audit service completeness',
      params: {
        sessionSlug: 'readiness',
        shardId: 'services',
        snapshotId: 'snapshot-1',
      },
    } as any)

    expect(generator.next().value).toMatchObject({
      toolName: 'spawn_agent_inline',
    })
    expect(generator.next({ toolResult: [] } as any).value).toBe('STEP')
    const completionCheck = generator.next({
      stepsComplete: true,
      agentState: { messageHistory: [] },
      toolResult: [],
    } as any).value as any

    expect(completionCheck.toolName).toBe('add_message')
    expect(completionCheck.input.content).toContain(
      'Audit completion was rejected',
    )
  })
})
