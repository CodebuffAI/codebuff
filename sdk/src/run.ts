import path from 'path'

import { callMainPrompt } from '@codebuff/agent-runtime/main-prompt'
import { getCancelledAdditionalMessages } from '@codebuff/agent-runtime/util/messages'
import { MAX_AGENT_STEPS_DEFAULT } from '@codebuff/common/constants/agents'
import { getMCPClient, listMCPTools } from '@codebuff/common/mcp/client'
import { toOptionalFile } from '@codebuff/common/old-constants'
import { toolNames } from '@codebuff/common/tools/constants'
import { clientToolCallSchema } from '@codebuff/common/tools/list'
import { AgentOutputSchema } from '@codebuff/common/types/session-state'
import { cloneDeep } from 'lodash'

import { getAgentRuntimeImpl } from './impl/agent-runtime'
import { getUserInfoFromApiKey } from './impl/database'
import { initialSessionState, applyOverridesToSessionState } from './run-state'
import { changeFile } from './tools/change-file'
import { codeSearch } from './tools/code-search'
import { glob } from './tools/glob'
import { listDirectory } from './tools/list-directory'
import { getFiles } from './tools/read-files'
import { runTerminalCommand } from './tools/run-terminal-command'

import type { CustomToolDefinition } from './custom-tool'
import type { RunState } from './run-state'
import type { WebSocketHandler } from './websocket-client'
import type { ServerAction } from '@codebuff/common/actions'
import type { AgentDefinition } from '@codebuff/common/templates/initial-agents-dir/types/agent-definition'
import type {
  PublishedToolName,
  ToolName,
} from '@codebuff/common/tools/constants'
import type {
  ClientToolCall,
  ClientToolName,
  CodebuffToolOutput,
  PublishedClientToolName,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import type { ToolMessage } from '@codebuff/common/types/messages/codebuff-message'
import type { ToolResultOutput } from '@codebuff/common/types/messages/content-part'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { SessionState } from '@codebuff/common/types/session-state'
import type { Source } from '@codebuff/common/types/source'
import type { CodebuffSpawn } from '@codebuff/common/types/spawn'

export type CodebuffClientOptions = {
  apiKey?: string

  cwd?: string
  projectFiles?: Record<string, string>
  knowledgeFiles?: Record<string, string>
  agentDefinitions?: AgentDefinition[]
  maxAgentSteps?: number
  env?: Record<string, string>

  handleEvent?: (event: PrintModeEvent) => void | Promise<void>
  handleStreamChunk?: (
    chunk:
      | string
      | {
          type: 'subagent_chunk'
          agentId: string
          agentType: string
          chunk: string
        }
      | {
          type: 'reasoning_chunk'
          agentId: string
          ancestorRunIds: string[]
          chunk: string
        },
  ) => void | Promise<void>

  overrideTools?: Partial<
    {
      [K in ClientToolName & PublishedToolName]: (
        input: ClientToolCall<K>['input'],
      ) => Promise<CodebuffToolOutput<K>>
    } & {
      // Include read_files separately, since it has a different signature.
      read_files: (input: {
        filePaths: string[]
      }) => Promise<Record<string, string | null>>
    }
  >
  customToolDefinitions?: CustomToolDefinition[]

  fsSource?: Source<CodebuffFileSystem>
  spawnSource?: Source<CodebuffSpawn>
  logger?: Logger
}

export type RunOptions = {
  agent: string | AgentDefinition
  prompt: string
  params?: Record<string, any>
  previousRun?: RunState
  extraToolResults?: ToolMessage[]
  signal?: AbortSignal
}

type RunReturnType = Awaited<ReturnType<typeof run>>
export async function run({
  apiKey,
  fingerprintId,

  cwd,
  projectFiles,
  knowledgeFiles,
  agentDefinitions,
  maxAgentSteps = MAX_AGENT_STEPS_DEFAULT,
  env,

  handleEvent,
  handleStreamChunk,

  overrideTools,
  customToolDefinitions,

  fsSource = () => require('fs').promises,
  spawnSource,
  logger,

  agent,
  prompt,
  params,
  previousRun,
  extraToolResults,
  signal,
}: RunOptions &
  CodebuffClientOptions & {
    apiKey: string
    fingerprintId: string
  }): Promise<RunState> {
  const fs = await (typeof fsSource === 'function' ? fsSource() : fsSource)
  const spawn: CodebuffSpawn = (
    spawnSource ? await spawnSource : require('child_process').spawn
  ) as CodebuffSpawn

  // Init session state
  let agentId
  if (typeof agent !== 'string') {
    agentDefinitions = [...(cloneDeep(agentDefinitions) ?? []), agent]
    agentId = agent.id
  } else {
    agentId = agent
  }
  let sessionState: SessionState
  if (previousRun?.sessionState) {
    // applyOverridesToSessionState handles deep cloning and applying any provided overrides
    sessionState = await applyOverridesToSessionState(
      cwd,
      previousRun.sessionState,
      {
        knowledgeFiles,
        agentDefinitions,
        customToolDefinitions,
        projectFiles,
        maxAgentSteps,
      },
    )
  } else {
    // No previous run, so create a fresh session state
    sessionState = await initialSessionState({
      cwd,
      knowledgeFiles,
      agentDefinitions,
      customToolDefinitions,
      projectFiles,
      maxAgentSteps,
      fs,
      spawn,
      logger,
    })
  }

  let resolve: (value: RunReturnType) => any = () => {}
  const promise = new Promise<RunReturnType>((res) => {
    resolve = res
  })

  async function onError(error: { message: string }) {
    if (handleEvent) {
      await handleEvent({ type: 'error', message: error.message })
    }
  }

  let pendingAgentResponse = ''
  /** Calculates the current session state if cancelled.
   *
   * This includes the user'e message and pending assistant message.
   */
  function getCancelledSessionState(message: string): SessionState {
    const state = cloneDeep(sessionState)
    state.mainAgentState.messageHistory.push(
      ...getCancelledAdditionalMessages({
        prompt,
        params,
        pendingAgentResponse,
        systemMessage: message,
      }),
    )
    return state
  }
  function getCancelledRunState(message?: string): RunState {
    message = message ?? 'Run cancelled by user.'
    return {
      sessionState: getCancelledSessionState(message),
      output: {
        type: 'error',
        message,
      },
    }
  }

  const buffers: Record<string | 0, string> = { 0: '' }

  const onResponseChunk = async (
    action: ServerAction<'response-chunk'>,
  ): Promise<void> => {
    if (signal?.aborted) {
      return
    }
    const { chunk } = action
    if (typeof chunk !== 'string' && chunk.type === 'tool_call') {
      logger?.info({ stack: new Error().stack, chunk }, `asdf onResponseChunk`)
    }

    if (typeof chunk === 'string') {
      pendingAgentResponse += chunk
    } else if (
      chunk.type === 'reasoning_delta' &&
      chunk.ancestorRunIds.length === 0
    ) {
      pendingAgentResponse += chunk.text
    }

    if (typeof chunk !== 'string') {
      if (chunk.type === 'reasoning_delta') {
        handleStreamChunk?.({
          type: 'reasoning_chunk',
          chunk: chunk.text,
          agentId: chunk.runId,
          ancestorRunIds: chunk.ancestorRunIds,
        })
      } else {
        await handleEvent?.(chunk)
      }
      return
    }

    handleStreamChunk?.(chunk)
  }
  const onSubagentResponseChunk = async (
    action: ServerAction<'subagent-response-chunk'>,
  ) => {
    if (signal?.aborted) {
      return
    }
    const { agentId, agentType, chunk } = action

    handleStreamChunk?.({
      type: 'subagent_chunk',
      agentId,
      agentType,
      chunk,
    })
  }

  const agentRuntimeImpl = getAgentRuntimeImpl({
    logger,
    apiKey,
    handleStepsLogChunk: () => {
      // Does nothing for now
    },
    requestToolCall: async ({ userInputId, toolName, input, mcpConfig }) => {
      return handleToolCall({
        action: {
          type: 'tool-call-request',
          requestId: crypto.randomUUID(),
          userInputId,
          toolName,
          input,
          timeout: undefined,
          mcpConfig,
        },
        overrides: overrideTools ?? {},
        customToolDefinitions: customToolDefinitions
          ? Object.fromEntries(
              customToolDefinitions.map((def) => [def.toolName, def]),
            )
          : {},
        cwd,
        fs,
        env,
      })
    },
    requestMcpToolData: async ({ mcpConfig, toolNames }) => {
      const mcpClientId = await getMCPClient(mcpConfig)
      const tools = (await listMCPTools(mcpClientId)).tools
      const filteredTools: typeof tools = []
      for (const tool of tools) {
        if (!toolNames) {
          filteredTools.push(tool)
          continue
        }
        if (tool.name in toolNames) {
          filteredTools.push(tool)
          continue
        }
      }

      return filteredTools
    },
    requestFiles: ({ filePaths }) =>
      readFiles({
        filePaths,
        override: overrideTools?.read_files,
        cwd,
        fs,
      }),
    requestOptionalFile: async ({ filePath }) => {
      const files = await readFiles({
        filePaths: [filePath],
        override: overrideTools?.read_files,
        cwd,
        fs,
      })
      return toOptionalFile(files[filePath] ?? null)
    },
    sendAction: ({ action }) => {
      if (action.type === 'action-error') {
        onError({ message: action.message })
        return
      }
      if (action.type === 'response-chunk') {
        onResponseChunk(action)
        return
      }
      if (action.type === 'subagent-response-chunk') {
        onSubagentResponseChunk(action)
        return
      }
      if (action.type === 'prompt-response') {
        handlePromptResponse({
          action,
          resolve,
          onError,
          initialSessionState: sessionState,
        })
        return
      }
      if (action.type === 'prompt-error') {
        handlePromptResponse({
          action,
          resolve,
          onError,
          initialSessionState: sessionState,
        })
        return
      }
    },
    sendSubagentChunk: ({
      userInputId,
      agentId,
      agentType,
      chunk,
      prompt,
      forwardToPrompt = true,
    }) => {
      onSubagentResponseChunk({
        type: 'subagent-response-chunk',
        userInputId,
        agentId,
        agentType,
        chunk,
        prompt,
        forwardToPrompt,
      })
    },
  })

  const promptId = Math.random().toString(36).substring(2, 15)

  // Send input
  const userInfo = await getUserInfoFromApiKey({
    ...agentRuntimeImpl,
    apiKey,
    fields: ['id'],
  })
  if (!userInfo) {
    return getCancelledRunState('Invalid API key or user not found')
  }

  const userId = userInfo.id

  signal?.addEventListener('abort', () => {
    resolve(getCancelledRunState())
  })
  if (signal?.aborted) {
    return getCancelledRunState()
  }

  callMainPrompt({
    ...agentRuntimeImpl,
    promptId,
    action: {
      type: 'prompt',
      promptId,
      prompt,
      promptParams: params,
      fingerprintId: fingerprintId,
      costMode: 'normal',
      sessionState,
      toolResults: extraToolResults ?? [],
      agentId,
    },
    repoUrl: undefined,
    repoId: undefined,
    clientSessionId: promptId,
    userId,
    signal: signal ?? new AbortController().signal,
  }).catch((error) => resolve(getCancelledRunState(error.message)))

  return promise
}

function requireCwd(cwd: string | undefined, toolName: string): string {
  if (!cwd) {
    throw new Error(
      `cwd is required for the ${toolName} tool. Please provide cwd in CodebuffClientOptions or override the ${toolName} tool.`,
    )
  }
  return cwd
}

async function readFiles({
  filePaths,
  override,
  cwd,
  fs,
}: {
  filePaths: string[]
  override?: NonNullable<
    Required<CodebuffClientOptions>['overrideTools']['read_files']
  >
  cwd?: string
  fs: CodebuffFileSystem
}) {
  if (override) {
    return await override({ filePaths })
  }
  return getFiles({ filePaths, cwd: requireCwd(cwd, 'read_files'), fs })
}

async function handleToolCall({
  action,
  overrides,
  customToolDefinitions,
  cwd,
  fs,
  env,
}: {
  action: ServerAction<'tool-call-request'>
  overrides: NonNullable<CodebuffClientOptions['overrideTools']>
  customToolDefinitions: Record<string, CustomToolDefinition>
  cwd?: string
  fs: CodebuffFileSystem
  env?: Record<string, string>
}): ReturnType<WebSocketHandler['handleToolCall']> {
  const toolName = action.toolName
  const input = action.input

  let result: ToolResultOutput[]
  if (toolNames.includes(toolName as ToolName)) {
    clientToolCallSchema.parse(action)
  } else {
    const customToolHandler = customToolDefinitions[toolName]

    if (!customToolHandler) {
      throw new Error(
        `Custom tool handler not found for user input ID ${action.userInputId}`,
      )
    }
    return {
      output: await customToolHandler.execute(action.input),
    }
  }

  try {
    let override = overrides[toolName as PublishedClientToolName]
    if (!override && toolName === 'str_replace') {
      // Note: write_file and str_replace have the same implementation, so reuse their write_file override.
      override = overrides['write_file']
    }
    if (override) {
      result = await override(input as any)
    } else if (toolName === 'end_turn') {
      result = []
    } else if (toolName === 'write_file' || toolName === 'str_replace') {
      result = await changeFile({
        parameters: input,
        cwd: requireCwd(cwd, toolName),
        fs,
      })
    } else if (toolName === 'run_terminal_command') {
      const resolvedCwd = requireCwd(cwd, 'run_terminal_command')
      result = await runTerminalCommand({
        ...input,
        cwd: path.resolve(resolvedCwd, input.cwd ?? '.'),
        env,
      } as Parameters<typeof runTerminalCommand>[0])
    } else if (toolName === 'code_search') {
      result = await codeSearch({
        projectPath: requireCwd(cwd, 'code_search'),
        ...input,
      } as Parameters<typeof codeSearch>[0])
    } else if (toolName === 'list_directory') {
      result = await listDirectory({
        directoryPath: (input as { path: string }).path,
        projectPath: requireCwd(cwd, 'list_directory'),
        fs,
      })
    } else if (toolName === 'glob') {
      result = await glob({
        pattern: (input as { pattern: string; cwd?: string }).pattern,
        projectPath: requireCwd(cwd, 'glob'),
        cwd: (input as { pattern: string; cwd?: string }).cwd,
        fs,
      })
    } else if (toolName === 'run_file_change_hooks') {
      // No-op: SDK doesn't run file change hooks
      result = [
        {
          type: 'json',
          value: {
            message: 'File change hooks are not supported in SDK mode',
          },
        },
      ]
    } else {
      throw new Error(
        `Tool not implemented in SDK. Please provide an override or modify your agent to not use this tool: ${toolName}`,
      )
    }
  } catch (error) {
    result = [
      {
        type: 'json',
        value: {
          errorMessage:
            error &&
            typeof error === 'object' &&
            'message' in error &&
            typeof error.message === 'string'
              ? error.message
              : typeof error === 'string'
                ? error
                : 'Unknown error',
        },
      },
    ]
  }
  return {
    output: result,
  }
}

async function handlePromptResponse({
  action,
  resolve,
  onError,
  initialSessionState,
}: {
  action: ServerAction<'prompt-response'> | ServerAction<'prompt-error'>
  resolve: (value: RunReturnType) => any
  onError: (error: { message: string }) => void
  initialSessionState: SessionState
}) {
  if (action.type === 'prompt-error') {
    onError({ message: action.message })
    resolve({
      sessionState: initialSessionState,
      output: {
        type: 'error',
        message: action.message,
      },
    })
  } else if (action.type === 'prompt-response') {
    // Stop enforcing session state schema! It's a black box we will pass back to the server.
    // Only check the output schema.
    const parsedOutput = AgentOutputSchema.safeParse(action.output)
    if (!parsedOutput.success) {
      const message = [
        'Received invalid prompt response from server:',
        JSON.stringify(parsedOutput.error.issues),
        'If this issues persists, please contact support@codebuff.com',
      ].join('\n')
      onError({ message })
      resolve({
        sessionState: initialSessionState,
        output: {
          type: 'error',
          message,
        },
      })
      return
    }
    const { sessionState, output } = action

    const state: RunState = {
      sessionState,
      output: output ?? {
        type: 'error',
        message: 'No output from agent',
      },
    }
    resolve(state)
  } else {
    action satisfies never
    onError({
      message: 'Internal error: prompt response type not handled',
    })
    resolve({
      sessionState: initialSessionState,
      output: {
        type: 'error',
        message: 'Internal error: prompt response type not handled',
      },
    })
  }
}
