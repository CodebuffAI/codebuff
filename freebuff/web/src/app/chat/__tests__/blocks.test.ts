import { describe, expect, it } from 'bun:test'

import { BlockTreeBuilder, isChatBlockArray } from '../blocks'

import type { AgentBlock } from '../blocks'

describe('BlockTreeBuilder', () => {
  it('builds a nested tree from a typical research turn', () => {
    const tree = new BlockTreeBuilder()
    tree.apply({ type: 'delta', text: 'Let me look that up.' })
    tree.apply({
      type: 'agent_start',
      agentId: 'a1',
      parentAgentId: 'main-agent',
      name: 'Weeb',
      agentType: 'researcher-web',
      prompt: 'What is the latest version?',
    })
    tree.apply({
      type: 'agent_tool',
      agentId: 'a1',
      toolCallId: 't1',
      toolName: 'web_search',
      label: 'latest version',
    })
    tree.apply({ type: 'agent_tool_done', toolCallId: 't1' })
    tree.apply({ type: 'agent_delta', agentId: 'a1', text: 'Found ' })
    tree.apply({ type: 'agent_delta', agentId: 'a1', text: 'it.' })
    tree.apply({ type: 'agent_finish', agentId: 'a1' })
    tree.apply({ type: 'delta', text: ' Here is the answer.' })

    expect(tree.hasAgentBlocks).toBe(true)
    expect(tree.blocks).toEqual([
      { type: 'text', text: 'Let me look that up.' },
      {
        type: 'agent',
        agentId: 'a1',
        name: 'Weeb',
        agentType: 'researcher-web',
        prompt: 'What is the latest version?',
        status: 'done',
        blocks: [
          {
            type: 'tool',
            toolCallId: 't1',
            toolName: 'web_search',
            label: 'latest version',
            status: 'done',
          },
          { type: 'text', text: 'Found it.' },
        ],
      },
      { type: 'text', text: ' Here is the answer.' },
    ])
    expect(isChatBlockArray(tree.snapshot())).toBe(true)
  })

  it('nests agents under their parent and drops events for unknown agents', () => {
    const tree = new BlockTreeBuilder()
    tree.apply({
      type: 'agent_start',
      agentId: 'parent',
      name: 'Parent',
      agentType: 'p',
    })
    tree.apply({
      type: 'agent_start',
      agentId: 'child',
      parentAgentId: 'parent',
      name: 'Child',
      agentType: 'c',
    })
    tree.apply({ type: 'agent_delta', agentId: 'child', text: 'deep' })
    // The root agent's own tool calls reference an agentId that never had an
    // agent_start; they must not show up anywhere.
    tree.apply({
      type: 'agent_tool',
      agentId: 'main-agent',
      toolCallId: 'tx',
      toolName: 'spawn_agents',
      label: '',
    })

    expect(tree.blocks).toHaveLength(1)
    const parent = tree.blocks[0] as AgentBlock
    const child = parent.blocks[0] as AgentBlock
    expect(child.name).toBe('Child')
    expect(child.blocks).toEqual([{ type: 'text', text: 'deep' }])
  })

  it('finalize marks everything done', () => {
    const tree = new BlockTreeBuilder()
    tree.apply({ type: 'agent_start', agentId: 'a1', name: 'A', agentType: 'a' })
    tree.apply({
      type: 'agent_tool',
      agentId: 'a1',
      toolCallId: 't1',
      toolName: 'read_url',
      label: 'https://example.com',
    })
    tree.finalize()
    const agent = tree.blocks[0] as AgentBlock
    expect(agent.status).toBe('done')
    expect(agent.blocks[0]).toMatchObject({ type: 'tool', status: 'done' })
  })
})
