import { describe, expect, it } from 'bun:test'

import { getEffectiveAgentToolNames } from '../agent-tool-names'

import type { AgentTemplate } from '../../templates/types'

function template(overrides: Partial<AgentTemplate>): AgentTemplate {
  return {
    id: 'test-agent',
    displayName: 'Test Agent',
    model: 'openai/gpt-5.3',
    toolNames: [],
    spawnableAgents: [],
    ...overrides,
  } as AgentTemplate
}

describe('getEffectiveAgentToolNames', () => {
  it('adds set_output to structured-output agents that omitted it', () => {
    expect(
      getEffectiveAgentToolNames(
        template({ outputMode: 'structured_output', toolNames: ['read_files'] }),
      ),
    ).toEqual(['read_files', 'set_output'])
  })

  it('does not duplicate an explicitly declared set_output tool', () => {
    expect(
      getEffectiveAgentToolNames(
        template({
          outputMode: 'structured_output',
          toolNames: ['read_files', 'set_output'],
        }),
      ),
    ).toEqual(['read_files', 'set_output'])
  })

  it('does not grant set_output to ordinary last-message agents', () => {
    expect(
      getEffectiveAgentToolNames(
        template({ outputMode: 'last_message', toolNames: ['read_files'] }),
      ),
    ).toEqual(['read_files'])
  })
})
