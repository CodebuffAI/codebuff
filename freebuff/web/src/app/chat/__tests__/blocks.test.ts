import { describe, expect, it } from 'bun:test'

import { BlockTreeBuilder, isChatBlockArray, toolCallDisplay } from '../blocks'

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

    expect(tree.hasActivityBlocks).toBe(true)
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
    // Tool calls attributed to an agentId that never had an agent_start must
    // not show up anywhere.
    tree.apply({
      type: 'agent_tool',
      agentId: 'never-started',
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

  it('renders the root agent tool calls as top-level rows', () => {
    const tree = new BlockTreeBuilder()
    tree.apply({ type: 'delta', text: 'Let me check the catalog.' })
    tree.apply({
      type: 'agent_tool',
      toolCallId: 'g1',
      toolName: 'gravity_index',
      label: 'transactional email for Next.js',
      verbs: { running: 'Finding services', done: 'Found services' },
    })
    tree.apply({ type: 'agent_tool_done', toolCallId: 'g1' })
    tree.apply({ type: 'delta', text: ' I recommend Resend.' })

    expect(tree.hasActivityBlocks).toBe(true)
    expect(tree.blocks).toEqual([
      { type: 'text', text: 'Let me check the catalog.' },
      {
        type: 'tool',
        toolCallId: 'g1',
        toolName: 'gravity_index',
        label: 'transactional email for Next.js',
        verbs: { running: 'Finding services', done: 'Found services' },
        status: 'done',
      },
      { type: 'text', text: ' I recommend Resend.' },
    ])
    // Tool rows never leak into the persisted message content.
    expect(tree.rootText).toBe('Let me check the catalog. I recommend Resend.')
    expect(isChatBlockArray(tree.snapshot())).toBe(true)
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

describe('toolCallDisplay', () => {
  it('summarizes web_search and read_url by their main argument', () => {
    expect(toolCallDisplay('web_search', { query: 'bun 1.3' })).toEqual({
      label: 'bun 1.3',
    })
    expect(toolCallDisplay('read_url', { url: 'https://a.dev' })).toEqual({
      label: 'https://a.dev',
    })
  })

  it('gives gravity_index per-action verbs and labels', () => {
    expect(
      toolCallDisplay('gravity_index', {
        action: 'search',
        query: 'postgres hosting',
      }),
    ).toEqual({
      label: 'postgres hosting',
      verbs: { running: 'Finding services', done: 'Found services' },
    })
    expect(
      toolCallDisplay('gravity_index', {
        action: 'browse',
        category: 'Email',
        q: 'send',
      }),
    ).toEqual({
      label: 'Email · send',
      verbs: { running: 'Browsing services', done: 'Browsed services' },
    })
    expect(
      toolCallDisplay('gravity_index', { action: 'get_service', slug: 'resend' }),
    ).toEqual({
      label: 'resend',
      verbs: { running: 'Fetching service', done: 'Fetched service' },
    })
  })

  it('falls back to an empty label for unknown tools', () => {
    expect(toolCallDisplay('mystery_tool', { x: 1 })).toEqual({ label: '' })
  })
})
