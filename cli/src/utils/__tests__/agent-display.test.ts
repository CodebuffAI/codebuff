import { describe, expect, test } from 'bun:test'

import { getAgentDisplayPrompt } from '../agent-display'

import type { AgentContentBlock } from '../../types/chat'

const createAgentBlock = (
  overrides: Partial<AgentContentBlock>,
): AgentContentBlock => ({
  type: 'agent',
  agentId: 'agent-1',
  agentName: 'Basher',
  agentType: 'basher',
  content: '',
  status: 'running',
  blocks: [],
  initialPrompt: '',
  ...overrides,
})

describe('getAgentDisplayPrompt', () => {
  test('uses initial prompt when present', () => {
    const block = createAgentBlock({
      initialPrompt: 'Run tests',
      params: {
        what_to_summarize: 'Summarize failures',
      },
    })

    expect(getAgentDisplayPrompt(block)).toBe('Run tests')
  })

  test('uses basher what_to_summarize when prompt is omitted', () => {
    const block = createAgentBlock({
      params: {
        command: 'bun test',
        what_to_summarize: 'Summarize failing tests only',
      },
    })

    expect(getAgentDisplayPrompt(block)).toBe('Summarize failing tests only')
  })

  test('normalizes scoped and versioned basher agent ids', () => {
    const block = createAgentBlock({
      agentType: 'codebuff/basher@1.0.0',
      params: {
        what_to_summarize: 'Summarize command output',
      },
    })

    expect(getAgentDisplayPrompt(block)).toBe('Summarize command output')
  })

  test('ignores non-basher what_to_summarize params', () => {
    const block = createAgentBlock({
      agentName: 'code-searcher',
      agentType: 'code-searcher',
      params: {
        what_to_summarize: 'This is not a basher prompt',
      },
    })

    expect(getAgentDisplayPrompt(block)).toBeUndefined()
  })
})
