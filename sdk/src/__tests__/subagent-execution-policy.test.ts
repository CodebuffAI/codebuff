import * as runAgentStep from '@codebuff/agent-runtime/run-agent-step'
import { handleSpawnAgentInline } from '@codebuff/agent-runtime/tools/handlers/tool/spawn-agent-inline'
import { handleSpawnAgents } from '@codebuff/agent-runtime/tools/handlers/tool/spawn-agents'
import { extractSubagentContextParams } from '@codebuff/agent-runtime/tools/handlers/tool/spawn-agent-utils'
import * as mcpClientModule from '@codebuff/common/mcp/client'
import {
  mockFileContext,
  TEST_AGENT_RUNTIME_IMPL,
} from '@codebuff/common/testing/impl/agent-runtime'
import { createMockFs } from '@codebuff/common/testing/mocks/filesystem'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { assistantMessage } from '@codebuff/common/util/messages'
import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { z } from 'zod/v4'

import {
  createExecutionPolicy,
  guardFileSystem,
} from '../permissions/execution-policy'
import { handleToolCall } from '../run'

import type { SubagentContextParams } from '@codebuff/agent-runtime/tools/handlers/tool/spawn-agent-utils'
import type { MCPConfig } from '@codebuff/common/types/mcp'
import type { CustomToolDefinition } from '../custom-tool'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { ToolResultOutput } from '@codebuff/common/types/messages/content-part'

type SpawnMode = 'spawn_agents' | 'spawn_agent_inline'

function createMockAgent(
  id: string,
  spawnableAgents: string[] = [],
): AgentTemplate {
  return {
    id,
    displayName: `Mock ${id}`,
    outputMode: 'last_message',
    inputSchema: {
      prompt: {
        safeParse: () => ({ success: true }),
      } as unknown as AgentTemplate['inputSchema']['prompt'],
    },
    spawnerPrompt: '',
    model: '',
    includeMessageHistory: true,
    inheritParentSystemPrompt: false,
    mcpServers: {},
    toolNames: [],
    spawnableAgents,
    systemPrompt: '',
    instructionsPrompt: '',
    stepPrompt: '',
  }
}

async function runSpawnCase(mode: SpawnMode) {
  const policy = createExecutionPolicy({
    projectRoot: '/project',
    noShell: true,
    projectOnly: true,
    readOnly: true,
  })
  const rawFs = createMockFs()
  const fs = guardFileSystem(rawFs, policy)
  const attempts: Array<{ toolName: string; output: ToolResultOutput[] }> = []
  const signal = new AbortController().signal
  const shellOverride = mock(async () => [
    { type: 'json' as const, value: { message: 'override should not run' } },
  ])
  const customToolExecute = mock(async () => [
    { type: 'json' as const, value: { message: 'custom tool should not run' } },
  ])
  const customToolDefinitions: Record<string, CustomToolDefinition> = {
    custom_external: {
      toolName: 'custom_external',
      inputSchema: z.object({}),
      description: 'Custom tool used to verify the external-tool gate.',
      endsAgentStep: true,
      exampleInputs: [{}],
      execute: customToolExecute,
    },
  }

  const requestToolCall: SubagentContextParams['requestToolCall'] = async ({
    userInputId,
    toolName,
    input,
    mcpConfig,
  }) => {
    const result = await handleToolCall({
      action: {
        type: 'tool-call-request',
        requestId: crypto.randomUUID(),
        userInputId,
        toolName,
        input,
        timeout: undefined,
        mcpConfig,
      },
      overrides: { run_terminal_command: shellOverride },
      customToolDefinitions,
      cwd: '/project',
      fs,
      signal,
      policy,
    })
    attempts.push({ toolName, output: result.output })
    return result
  }

  const childAgent = createMockAgent('child', ['nested'])
  const nestedAgent = createMockAgent('nested')
  const rootAgent = createMockAgent('root', ['child'])
  const localAgentTemplates = { child: childAgent, nested: nestedAgent }
  const rootState = getInitialSessionState(mockFileContext).mainAgentState

  const tryRestrictedCalls = async (
    inheritedRequestToolCall: SubagentContextParams['requestToolCall'],
    userInputId: string,
  ) => {
    await Promise.all([
      inheritedRequestToolCall({
        userInputId,
        toolName: 'run_terminal_command',
        input: {
          command: 'touch /outside/should-not-run',
          process_type: 'SYNC',
        },
      }),
      inheritedRequestToolCall({
        userInputId,
        toolName: 'list_directory',
        input: { path: '../outside' },
      }),
      inheritedRequestToolCall({
        userInputId,
        toolName: 'write_file',
        input: { path: 'new-file.txt', content: 'must not be written' },
      }),
      inheritedRequestToolCall({
        userInputId,
        toolName: 'custom_external',
        input: {},
      }),
      inheritedRequestToolCall({
        userInputId,
        toolName: 'mcp__test__ping',
        input: {},
        mcpConfig: {
          type: 'http',
          url: 'http://127.0.0.1:1',
          params: {},
          headers: {},
        },
      }),
    ])
  }

  const loopSpy = spyOn(runAgentStep, 'loopAgentSteps').mockImplementation(
    async (options) => {
      await tryRestrictedCalls(options.requestToolCall, options.userInputId)

      const currentAgentTemplate = options.agentTemplate
      if (currentAgentTemplate?.id === 'child') {
        // Spawn one more level through the real inline handler. It must receive
        // the same requestToolCall closure as the root and direct child.
        const nestedContext = extractSubagentContextParams(
          options as SubagentContextParams,
        )
        await handleSpawnAgentInline({
          ...nestedContext,
          agentState: options.agentState,
          agentTemplate: currentAgentTemplate,
          fileContext: options.fileContext,
          fingerprintId: 'test-fingerprint',
          localAgentTemplates,
          logger: options.logger,
          ancestorRunIds: options.ancestorRunIds,
          system: 'Test system prompt',
          tools: {},
          userInputId: 'nested-spawn',
          writeToClient: () => {},
          previousToolCallFinished: Promise.resolve(),
          toolCall: {
            toolName: 'spawn_agent_inline',
            toolCallId: 'nested-tool-call',
            input: { agent_type: 'nested', prompt: 'try restricted actions' },
          },
        })
      }

      const response = assistantMessage('Mock agent response')
      return {
        agentState: {
          ...options.agentState,
          messageHistory: [response],
        },
        output: { type: 'lastMessage', value: [response] },
      }
    },
  )

  const commonParams = {
    ...TEST_AGENT_RUNTIME_IMPL,
    requestToolCall,
    ancestorRunIds: [],
    clientSessionId: 'test-session',
    fileContext: mockFileContext,
    fingerprintId: 'test-fingerprint',
    localAgentTemplates,
    previousToolCallFinished: Promise.resolve(),
    repoId: undefined,
    repoUrl: undefined,
    sendSubagentChunk: () => {},
    signal,
    system: 'Test system prompt',
    tools: {},
    userId: 'test-user',
    userInputId: 'root-input',
    writeToClient: () => {},
  }

  if (mode === 'spawn_agents') {
    await handleSpawnAgents({
      ...commonParams,
      agentState: rootState,
      agentTemplate: rootAgent,
      toolCall: {
        toolName: 'spawn_agents',
        toolCallId: 'root-tool-call',
        input: {
          agents: [{ agent_type: 'child', prompt: 'try restricted actions' }],
        },
      },
    })
  } else {
    await handleSpawnAgentInline({
      ...commonParams,
      agentState: rootState,
      agentTemplate: rootAgent,
      toolCall: {
        toolName: 'spawn_agent_inline',
        toolCallId: 'root-tool-call',
        input: { agent_type: 'child', prompt: 'try restricted actions' },
      },
    })
  }

  loopSpy.mockRestore()

  expect(attempts).toHaveLength(10)
  for (const attempt of attempts) {
    const output = JSON.stringify(attempt.output)
    if (attempt.toolName === 'run_terminal_command') {
      expect(output).toContain('external capability')
    } else if (attempt.toolName === 'list_directory') {
      expect(output).toContain('outside project root')
    } else if (attempt.toolName === 'write_file') {
      expect(output).toContain('--read-only')
    } else {
      expect(output).toContain('external capability')
    }
  }
  expect(rawFs.writeFile).not.toHaveBeenCalled()
  expect(shellOverride).not.toHaveBeenCalled()
  expect(customToolExecute).not.toHaveBeenCalled()
}

describe('subagent execution policy inheritance', () => {
  afterEach(() => mock.restore())

  test('spawn_agents and nested agents retain the parent policy callback', async () => {
    await runSpawnCase('spawn_agents')
  })

  test('spawn_agent_inline and nested agents retain the parent policy callback', async () => {
    await runSpawnCase('spawn_agent_inline')
  })
})

describe('dispatch-origin execution policy', () => {
  afterEach(() => mock.restore())

  const action = (toolName: string, mcpConfig?: MCPConfig) => ({
    type: 'tool-call-request' as const,
    requestId: crypto.randomUUID(),
    userInputId: 'test-input',
    toolName,
    input: {
      path: 'src/output.ts',
      instructions: 'Create a file for the test',
      content: 'export {}\n',
    },
    timeout: undefined,
    mcpConfig,
  })

  test('MCP tools with built-in names are classified as external', async () => {
    const getMCPClient = spyOn(
      mcpClientModule,
      'getMCPClient',
    ).mockResolvedValue('mcp-client')
    const policy = createExecutionPolicy({
      projectRoot: '/project',
      noShell: true,
    })
    const result = await handleToolCall({
      action: action('write_file', {
        type: 'http',
        url: 'http://127.0.0.1:1',
        params: {},
        headers: {},
      }),
      overrides: {},
      customToolDefinitions: {},
      cwd: '/project',
      fs: guardFileSystem(createMockFs(), policy),
      policy,
    })

    expect(JSON.stringify(result.output)).toContain('external capability')
    expect(getMCPClient).not.toHaveBeenCalled()
  })

  test('built-in host overrides require external trust under restrictions', async () => {
    const hostOverride = mock(async () => [
      { type: 'json' as const, value: { message: 'host override ran' } },
    ])
    const policy = createExecutionPolicy({
      projectRoot: '/project',
      noShell: true,
    })
    const result = await handleToolCall({
      action: action('write_file'),
      overrides: { write_file: hostOverride },
      customToolDefinitions: {},
      cwd: '/project',
      fs: guardFileSystem(createMockFs(), policy),
      policy,
    })

    expect(JSON.stringify(result.output)).toContain('external capability')
    expect(hostOverride).not.toHaveBeenCalled()
  })

  test('trusted built-in overrides still follow built-in filesystem policy', async () => {
    const hostOverride = mock(async () => [
      { type: 'json' as const, value: { message: 'host override ran' } },
    ])
    const policy = createExecutionPolicy({
      projectRoot: '/project',
      noShell: true,
      readOnly: true,
      allowExternalTools: true,
    })
    const result = await handleToolCall({
      action: action('write_file'),
      overrides: { write_file: hostOverride },
      customToolDefinitions: {},
      cwd: '/project',
      fs: guardFileSystem(createMockFs(), policy),
      policy,
    })

    expect(JSON.stringify(result.output)).toContain('read-only mode')
    expect(hostOverride).not.toHaveBeenCalled()
  })
})
