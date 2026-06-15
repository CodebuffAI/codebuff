import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { promptSuccess } from '@codebuff/common/util/error'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'

import { createToolCallChunk, mockFileContext } from './test-utils'
import * as webApi from '../llm-api/codebuff-web-api'
import { runAgentStep } from '../run-agent-step'
import { assembleLocalAgentTemplates } from '../templates/agent-registry'

import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { StreamChunk } from '@codebuff/common/types/contracts/llm'

let agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps
let runAgentStepBaseParams: ParamsExcluding<
  typeof runAgentStep,
  'localAgentTemplates' | 'agentState' | 'prompt' | 'agentTemplate'
>

function mockAgentStream(chunks: StreamChunk[]) {
  runAgentStepBaseParams.promptAiSdkStream = async function* ({}) {
    for (const chunk of chunks) {
      yield chunk
    }
    return promptSuccess('mock-message-id')
  }
}

const gravityTestAgent = {
  id: 'gravity-test-agent',
  displayName: 'Gravity Test Agent',
  model: 'openai/gpt-4o-mini',
  toolNames: ['gravity_index', 'end_turn'],
  systemPrompt: 'Use Gravity Index when choosing developer services.',
}

describe('gravity_index tool', () => {
  beforeEach(() => {
    agentRuntimeImpl = {
      ...TEST_AGENT_RUNTIME_IMPL,
    }
    runAgentStepBaseParams = {
      ...agentRuntimeImpl,
      additionalToolDefinitions: () => Promise.resolve({}),
      agentType: 'gravity-test-agent',
      ancestorRunIds: [],
      clientSessionId: 'test-session',
      fileContext: {
        ...mockFileContext,
        agentTemplates: { 'gravity-test-agent': gravityTestAgent },
      },
      fingerprintId: 'test-fingerprint',
      onResponseChunk: () => {},
      repoId: undefined,
      repoUrl: undefined,
      runId: 'test-run-id',
      signal: new AbortController().signal,
      spawnParams: undefined,
      system: 'Test system prompt',
      tools: {},
      userId: TEST_USER_ID,
      userInputId: 'test-input',
    }

    runAgentStepBaseParams.requestFiles = async () => ({})
    runAgentStepBaseParams.requestOptionalFile = async () => null
    runAgentStepBaseParams.requestToolCall = async () => ({
      output: [{ type: 'json', value: 'Tool call success' }],
    })
    runAgentStepBaseParams.promptAiSdk = async function () {
      return promptSuccess('Test response')
    }
  })

  afterEach(() => {
    mock.restore()
  })

  test('calls Gravity Index facade with the query', async () => {
    const spy = spyOn(webApi, 'callGravityIndexAPI').mockResolvedValue({
      result: {
        search_id: 'search-1',
        recommendation: { name: 'SendGrid', slug: 'sendgrid' },
        credential_request: {
          setup_url: 'https://index.trygravity.ai/go/test',
          required_env_vars: ['SENDGRID_API_KEY'],
        },
        click_url: 'https://index.trygravity.ai/go/test',
      },
    })

    mockAgentStream([
      createToolCallChunk('gravity_index', {
        action: 'search',
        query: 'transactional email for Next.js',
      }),
      createToolCallChunk('end_turn', {}),
    ])

    const sessionState = getInitialSessionState(
      runAgentStepBaseParams.fileContext,
    )
    const agentState = {
      ...sessionState.mainAgentState,
      agentType: 'gravity-test-agent',
    }
    const { agentTemplates } = assembleLocalAgentTemplates({
      ...agentRuntimeImpl,
      fileContext: runAgentStepBaseParams.fileContext,
    })

    await runAgentStep({
      ...runAgentStepBaseParams,
      localAgentTemplates: agentTemplates,
      agentTemplate: agentTemplates['gravity-test-agent'],
      agentState,
      prompt: 'Find an email provider',
    })

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          action: 'search',
          query: 'transactional email for Next.js',
          external_session_id: 'test-session',
          metadata: expect.objectContaining({
            surface: 'codebuff_cli',
            tool_call_id: expect.any(String),
            agent_step_id: expect.any(String),
            fingerprint_id: 'test-fingerprint',
            user_input_id: 'test-input',
          }),
        }),
      }),
    )
  })

  test('tags base-chat traffic with the freebuff_chat surface', async () => {
    const spy = spyOn(webApi, 'callGravityIndexAPI').mockResolvedValue({
      result: { search_id: 'search-1' },
    })

    mockAgentStream([
      createToolCallChunk('gravity_index', {
        action: 'search',
        query: 'transactional email for Next.js',
      }),
      createToolCallChunk('end_turn', {}),
    ])

    const fileContext = {
      ...mockFileContext,
      agentTemplates: {
        'base-chat': {
          ...gravityTestAgent,
          id: 'base-chat',
          displayName: 'Freebuff Chat',
        },
      },
    }
    const sessionState = getInitialSessionState(fileContext)
    const agentState = {
      ...sessionState.mainAgentState,
      agentType: 'base-chat',
    }
    const { agentTemplates } = assembleLocalAgentTemplates({
      ...agentRuntimeImpl,
      fileContext,
    })

    await runAgentStep({
      ...runAgentStepBaseParams,
      agentType: 'base-chat',
      fileContext,
      localAgentTemplates: agentTemplates,
      agentTemplate: agentTemplates['base-chat'],
      agentState,
      prompt: 'Find an email provider',
    })

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          metadata: expect.objectContaining({
            surface: 'freebuff_chat',
          }),
        }),
      }),
    )
  })

  test('does not special-case base2-free traffic as web surface', async () => {
    const spy = spyOn(webApi, 'callGravityIndexAPI').mockResolvedValue({
      result: { search_id: 'search-1' },
    })

    mockAgentStream([
      createToolCallChunk('gravity_index', {
        action: 'search',
        query: 'transactional email for Next.js',
      }),
      createToolCallChunk('end_turn', {}),
    ])

    const fileContext = {
      ...mockFileContext,
      agentTemplates: {
        'base2-free-deepseek': {
          ...gravityTestAgent,
          id: 'base2-free-deepseek',
          displayName: 'Buffy the DeepSeek Free Orchestrator',
        },
      },
    }
    const sessionState = getInitialSessionState(fileContext)
    const agentState = {
      ...sessionState.mainAgentState,
      agentType: 'base2-free-deepseek',
    }
    const { agentTemplates } = assembleLocalAgentTemplates({
      ...agentRuntimeImpl,
      fileContext,
    })

    await runAgentStep({
      ...runAgentStepBaseParams,
      agentType: 'base2-free-deepseek',
      fileContext,
      localAgentTemplates: agentTemplates,
      agentTemplate: agentTemplates['base2-free-deepseek'],
      agentState,
      prompt: 'Find an email provider',
    })

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          metadata: expect.objectContaining({
            surface: 'codebuff_cli',
          }),
        }),
      }),
    )
  })

  test('stores recommendation and setup URL in tool output', async () => {
    spyOn(webApi, 'callGravityIndexAPI').mockResolvedValue({
      result: {
        search_id: 'search-1',
        recommendation: {
          name: 'SendGrid',
          slug: 'sendgrid',
          category: 'Email',
        },
        reasoning: 'Good transactional email fit.',
        credential_request: {
          setup_url: 'https://index.trygravity.ai/go/test',
          required_env_vars: ['SENDGRID_API_KEY'],
        },
        click_url: 'https://index.trygravity.ai/go/test',
      },
    })

    mockAgentStream([
      createToolCallChunk('gravity_index', {
        action: 'search',
        query: 'transactional email for Next.js',
      }),
      createToolCallChunk('end_turn', {}),
    ])

    const sessionState = getInitialSessionState(
      runAgentStepBaseParams.fileContext,
    )
    const agentState = {
      ...sessionState.mainAgentState,
      agentType: 'gravity-test-agent',
    }
    const { agentTemplates } = assembleLocalAgentTemplates({
      ...agentRuntimeImpl,
      fileContext: runAgentStepBaseParams.fileContext,
    })

    const { agentState: newAgentState } = await runAgentStep({
      ...runAgentStepBaseParams,
      localAgentTemplates: agentTemplates,
      agentTemplate: agentTemplates['gravity-test-agent'],
      agentState,
      prompt: 'Find an email provider',
    })

    const toolMsgs = newAgentState.messageHistory.filter(
      (m) => m.role === 'tool' && m.toolName === 'gravity_index',
    )
    expect(toolMsgs.length).toBeGreaterThan(0)
    const last = JSON.stringify(toolMsgs[toolMsgs.length - 1].content)
    expect(last).toContain('SendGrid')
    expect(last).toContain('https://index.trygravity.ai/go/test')
  })

  test('surfaces API errors in tool output', async () => {
    spyOn(webApi, 'callGravityIndexAPI').mockResolvedValue({
      error: 'Gravity Index is not configured',
    })

    mockAgentStream([
      createToolCallChunk('gravity_index', {
        action: 'search',
        query: 'transactional email for Next.js',
      }),
      createToolCallChunk('end_turn', {}),
    ])

    const sessionState = getInitialSessionState(
      runAgentStepBaseParams.fileContext,
    )
    const agentState = {
      ...sessionState.mainAgentState,
      agentType: 'gravity-test-agent',
    }
    const { agentTemplates } = assembleLocalAgentTemplates({
      ...agentRuntimeImpl,
      fileContext: runAgentStepBaseParams.fileContext,
    })

    const { agentState: newAgentState } = await runAgentStep({
      ...runAgentStepBaseParams,
      localAgentTemplates: agentTemplates,
      agentTemplate: agentTemplates['gravity-test-agent'],
      agentState,
      prompt: 'Find an email provider',
    })

    const toolMsgs = newAgentState.messageHistory.filter(
      (m) => m.role === 'tool' && m.toolName === 'gravity_index',
    )
    const last = JSON.stringify(toolMsgs[toolMsgs.length - 1].content)
    expect(last).toContain('errorMessage')
    expect(last).toContain('Gravity Index is not configured')
  })

  test('passes non-search actions through the unified facade', async () => {
    const spy = spyOn(webApi, 'callGravityIndexAPI').mockResolvedValue({
      result: {
        services: [{ name: 'SendGrid', slug: 'sendgrid' }],
        total: 1,
      },
    })

    mockAgentStream([
      createToolCallChunk('gravity_index', {
        action: 'browse',
        category: 'Email',
        q: 'send',
      }),
      createToolCallChunk('end_turn', {}),
    ])

    const sessionState = getInitialSessionState(
      runAgentStepBaseParams.fileContext,
    )
    const agentState = {
      ...sessionState.mainAgentState,
      agentType: 'gravity-test-agent',
    }
    const { agentTemplates } = assembleLocalAgentTemplates({
      ...agentRuntimeImpl,
      fileContext: runAgentStepBaseParams.fileContext,
    })

    await runAgentStep({
      ...runAgentStepBaseParams,
      localAgentTemplates: agentTemplates,
      agentTemplate: agentTemplates['gravity-test-agent'],
      agentState,
      prompt: 'Browse email providers',
    })

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          action: 'browse',
          category: 'Email',
          q: 'send',
        }),
      }),
    )
  })
})
