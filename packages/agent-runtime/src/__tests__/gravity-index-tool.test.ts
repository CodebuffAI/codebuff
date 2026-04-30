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
        conversion_url: 'https://index.trygravity.ai/go/test',
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
        input: {
          action: 'search',
          query: 'transactional email for Next.js',
        },
      }),
    )
  })

  test('stores recommendation and conversion URL in tool output', async () => {
    spyOn(webApi, 'callGravityIndexAPI').mockResolvedValue({
      result: {
        search_id: 'search-1',
        recommendation: {
          name: 'SendGrid',
          slug: 'sendgrid',
          category: 'Email',
        },
        reasoning: 'Good transactional email fit.',
        conversion_url: 'https://index.trygravity.ai/go/test',
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
        input: {
          action: 'browse',
          category: 'Email',
          q: 'send',
        },
      }),
    )
  })
})
