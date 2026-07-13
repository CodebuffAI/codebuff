import { describe, expect, test } from 'bun:test'
import z from 'zod/v4'

import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'

import { mockFileContext } from '../../../../__tests__/test-utils'
import { handleSetOutput } from '../set-output'

import type { AgentTemplate } from '../../../../templates/types'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'

describe('handleSetOutput', () => {
  test('returns a recoverable result without setting output for incomplete JSON data', async () => {
    const template: AgentTemplate = {
      id: 'reviewer-test',
      displayName: 'Reviewer Test',
      spawnerPrompt: 'Review code',
      model: 'claude-3-5-sonnet-20241022',
      inputSchema: {},
      outputMode: 'structured_output',
      outputSchema: z.object({ verdict: z.string() }),
      includeMessageHistory: false,
      inheritParentSystemPrompt: false,
      mcpServers: {},
      toolNames: ['set_output'],
      spawnableAgents: [],
      systemPrompt: 'Test system prompt',
      instructionsPrompt: 'Test instructions',
      stepPrompt: 'Test step prompt',
    }
    const agentState = getInitialSessionState(mockFileContext).mainAgentState
    agentState.agentType = template.id
    const toolCall = {
      toolName: 'set_output',
      toolCallId: 'incomplete-review-output',
      input: { data: '{"verdict":"LOOKS_GOOD"' },
    } as unknown as CodebuffToolCall<'set_output'>

    const { output } = await handleSetOutput({
      ...TEST_AGENT_RUNTIME_IMPL,
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      agentState,
      apiKey: 'test-api-key',
      localAgentTemplates: { [template.id]: template },
    } as unknown as Parameters<typeof handleSetOutput>[0])

    expect(agentState.output).toBeUndefined()
    expect(output).toEqual([
      {
        type: 'json',
        value: {
          message: expect.stringContaining('malformed or incomplete JSON text'),
        },
      },
    ])
  })
})
