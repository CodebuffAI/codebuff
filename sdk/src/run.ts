import path from 'path'

import { cloneDeep } from 'lodash'

import { initialSessionState, applyOverridesToSessionState } from './run-state'
import { changeFile } from './tools/change-file'
import { codeSearch } from './tools/code-search'
import { glob } from './tools/glob'
import { listDirectory } from './tools/list-directory'
import { getFiles } from './tools/read-files'
import { runTerminalCommand } from './tools/run-terminal-command'
import { WebSocketHandler } from './websocket-client'
import { PromptResponseSchema } from '../../common/src/actions'
import { MAX_AGENT_STEPS_DEFAULT } from '../../common/src/constants/agents'
import { toolNames } from '../../common/src/tools/constants'
import { clientToolCallSchema } from '../../common/src/tools/list'

import type { CustomToolDefinition } from './custom-tool'
import type { RunState } from './run-state'
import type { ServerAction } from '../../common/src/actions'
import type { AgentDefinition } from '../../common/src/templates/initial-agents-dir/types/agent-definition'
import type {
  PublishedToolName,
  ToolName,
} from '../../common/src/tools/constants'
import type {
  ClientToolCall,
  ClientToolName,
  CodebuffToolOutput,
  PublishedClientToolName,
} from '../../common/src/tools/list'
import type {
  ToolResultOutput,
  ToolResultPart,
} from '../../common/src/types/messages/content-part'
import type { PrintModeEvent } from '../../common/src/types/print-mode'
import {
  AgentOutputSchema,
  type SessionState,
} from '../../common/src/types/session-state'

export type CodebuffClientOptions = {
  // Provide an API key or set the CODEBUFF_API_KEY environment variable.
  apiKey?: string

  cwd?: string
  projectFiles?: Record<string, string>
  knowledgeFiles?: Record<string, string>
  agentDefinitions?: AgentDefinition[]
  maxAgentSteps?: number

  handleEvent?: (event: PrintModeEvent) => void | Promise<void>
  handleStreamChunk?: (chunk: string) => void | Promise<void>

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
}

export type RunOptions = {
  agent: string | AgentDefinition
  prompt: string
  params?: Record<string, any>
  previousRun?: RunState
  extraToolResults?: ToolResultPart[]
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

  handleEvent,
  handleStreamChunk,

  overrideTools,
  customToolDefinitions,

  agent,
  prompt,
  params,
  previousRun,
  extraToolResults,
}: RunOptions &
  CodebuffClientOptions & {
    apiKey: string
    fingerprintId: string
  }): Promise<RunState> {
  async function onError(error: { message: string }) {
    if (handleEvent) {
      await handleEvent({ type: 'error', message: error.message })
    }
  }

  let resolve: (value: RunReturnType) => any = () => {}
  const promise = new Promise<RunReturnType>((res) => {
    resolve = res
  })

  // TODO: bad pattern, switch to using SSE and move off of websockets
  const websocketHandler = new WebSocketHandler({
    apiKey,
    onWebsocketError: (error) => {
      onError({ message: error.message })
    },
    onWebsocketReconnect: () => {},
    onRequestReconnect: async () => {},
    onResponseError: async (error) => {
      onError({ message: error.message })
    },
    readFiles: ({ filePaths }) =>
      readFiles({
        filePaths,
        override: overrideTools?.read_files,
        cwd,
      }),
    handleToolCall: (action) =>
      handleToolCall({
        action,
        overrides: overrideTools ?? {},
        customToolDefinitions: customToolDefinitions
          ? Object.fromEntries(
              customToolDefinitions.map((def) => [def.toolName, def]),
            )
          : {},
        cwd,
      }),
    onCostResponse: async () => {},

    onResponseChunk: async (action) => {
      const { userInputId, chunk } = action
      if (typeof chunk === 'string') {
        await handleStreamChunk?.(chunk)
      } else {
        await handleEvent?.(chunk)
      }
    },
    onSubagentResponseChunk: async () => {},

    onPromptResponse: (action) =>
      handlePromptResponse({
        action,
        resolve,
        onError,
        initialSessionState: sessionState,
      }),
    onPromptError: (action) =>
      handlePromptResponse({
        action,
        resolve,
        onError,
        initialSessionState: sessionState,
      }),
  })

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
    sessionState = await initialSessionState(cwd, {
      knowledgeFiles,
      agentDefinitions,
      customToolDefinitions,
      projectFiles,
      maxAgentSteps,
    })
  }

  const promptId = Math.random().toString(36).substring(2, 15)

  // Send input
  await websocketHandler.connect()

  websocketHandler.sendInput({
    promptId,
    prompt,
    promptParams: params,
    fingerprintId: fingerprintId,
    costMode: 'normal',
    sessionState,
    toolResults: extraToolResults ?? [],
    agentId,
  })

  const result = await promise

  websocketHandler.close()

  return result
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
}: {
  filePaths: string[]
  override?: NonNullable<
    Required<CodebuffClientOptions>['overrideTools']['read_files']
  >
  cwd?: string
}) {
  if (override) {
    return await override({ filePaths })
  }
  return getFiles(filePaths, requireCwd(cwd, 'read_files'))
}

async function handleToolCall({
  action,
  overrides,
  customToolDefinitions,
  cwd,
}: {
  action: ServerAction<'tool-call-request'>
  overrides: NonNullable<CodebuffClientOptions['overrideTools']>
  customToolDefinitions: Record<string, CustomToolDefinition>
  cwd?: string
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
      result = changeFile(input, requireCwd(cwd, toolName))
    } else if (toolName === 'run_terminal_command') {
      const resolvedCwd = requireCwd(cwd, 'run_terminal_command')
      result = await runTerminalCommand({
        ...input,
        cwd: path.resolve(resolvedCwd, input.cwd ?? '.'),
      } as Parameters<typeof runTerminalCommand>[0])
    } else if (toolName === 'code_search') {
      result = await codeSearch({
        projectPath: requireCwd(cwd, 'code_search'),
        ...input,
      } as Parameters<typeof codeSearch>[0])
    } else if (toolName === 'list_directory') {
      result = await listDirectory(
        (input as { path: string }).path,
        requireCwd(cwd, 'list_directory'),
      )
    } else if (toolName === 'glob') {
      result = await glob(
        (input as { pattern: string; cwd?: string }).pattern,
        requireCwd(cwd, 'glob'),
        (input as { pattern: string; cwd?: string }).cwd,
      )
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
        output: { type: 'error', message },
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
