import * as analytics from '@codebuff/common/analytics'
import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import {
  createMockDbOperations,
  setupDbSpies,
} from '@codebuff/common/testing/mocks/database'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { promptSuccess } from '@codebuff/common/util/error'
import { assistantMessage } from '@codebuff/common/util/messages'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'

import { runAgentStep } from '../run-agent-step'

import type { AgentTemplate } from '../templates/types'
import type { DbSpies } from '@codebuff/common/testing/mocks/database'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { ProjectFileContext } from '@codebuff/common/util/file'

const mockFileContext: ProjectFileContext = {
  projectRoot: '/test',
  cwd: '/test',
  fileTree: [],
  fileTokenScores: {},
  knowledgeFiles: {},
  gitChanges: {
    status: '',
    diff: '',
    diffCached: '',
    lastCommitMessages: '',
  },
  changesSinceLastChat: {},
  shellConfigFiles: {},
  systemInfo: {
    platform: 'test',
    shell: 'test',
    nodeVersion: 'test',
    arch: 'test',
    homedir: '/home/test',
    cpus: 1,
    chromeAvailable: false,
  },
  agentTemplates: {},
  customToolDefinitions: {},
}

describe('runAgentStep - assistant prefill', () => {
  let agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps
  let runAgentStepBaseParams: ParamsExcluding<
    typeof runAgentStep,
    | 'agentType'
    | 'prompt'
    | 'localAgentTemplates'
    | 'agentState'
    | 'agentTemplate'
  >
  let dbSpies: DbSpies
  let capturedMessages: Message[]

  const makeAgent = (model: string): AgentTemplate => ({
    id: 'test-prefill-agent',
    displayName: 'Test Prefill Agent',
    spawnerPrompt: 'Testing assistant prefill handling',
    model,
    inputSchema: {},
    outputMode: 'last_message' as const,
    includeMessageHistory: true,
    inheritParentSystemPrompt: false,
    mcpServers: {},
    toolNames: [],
    spawnableAgents: [],
    systemPrompt: 'Test system prompt',
    instructionsPrompt: '',
    stepPrompt: '',
  })

  beforeEach(() => {
    agentRuntimeImpl = { ...TEST_AGENT_RUNTIME_IMPL, sendAction: () => {} }
    dbSpies = setupDbSpies(createMockDbOperations())
    spyOn(analytics, 'trackEvent').mockImplementation(() => {})

    capturedMessages = []
    runAgentStepBaseParams = {
      ...agentRuntimeImpl,

      additionalToolDefinitions: () => Promise.resolve({}),
      ancestorRunIds: [],
      clientSessionId: 'test-session',
      fileContext: mockFileContext,
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
      promptAiSdkStream: async function* ({ messages }) {
        capturedMessages = messages
        yield { type: 'text' as const, text: 'response text' }
        return promptSuccess('mock-message-id')
      },
    }
  })

  afterEach(() => {
    dbSpies.restore()
    mock.restore()
  })

  const runWithTrailingAssistantMessage = async (model: string) => {
    const agent = makeAgent(model)
    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState
    agentState.messageHistory = [assistantMessage('<think>partial thought')]

    await runAgentStep({
      ...runAgentStepBaseParams,
      agentType: agent.id,
      localAgentTemplates: { [agent.id]: agent },
      agentTemplate: agent,
      agentState,
      prompt: undefined,
    })
  }

  it('appends a user message when history ends with assistant on Claude 4.6+', async () => {
    await runWithTrailingAssistantMessage('anthropic/claude-opus-4.7')

    // Skip the system message prepended by getAgentStreamFromTemplate
    const last = capturedMessages[capturedMessages.length - 1]
    expect(last.role).toBe('user')
    expect(JSON.stringify(last.content)).toContain(
      'Continue from where you left off.',
    )
  })

  it('keeps trailing assistant message for models that support prefill', async () => {
    await runWithTrailingAssistantMessage('anthropic/claude-sonnet-4.5')

    const last = capturedMessages[capturedMessages.length - 1]
    expect(last.role).toBe('assistant')
  })
})
