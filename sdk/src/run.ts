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
import { toolNames, toolXmlName } from '../../common/src/tools/constants'
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

type ToolXmlFilterState = {
  buffer: string
  activeTag: 'tool_call' | 'tool_result' | null
}

const TOOL_XML_OPEN = `<${toolXmlName}>`
const TOOL_XML_CLOSE = `</${toolXmlName}>`
const TOOL_XML_PREFIX = `<${toolXmlName}`
const TOOL_RESULT_OPEN = '<tool_result>'
const TOOL_RESULT_CLOSE = '</tool_result>'
const TOOL_RESULT_PREFIX = '<tool_result'

const TAG_DEFINITIONS = [
  {
    type: 'tool_call' as const,
    open: TOOL_XML_OPEN,
    close: TOOL_XML_CLOSE,
    prefix: TOOL_XML_PREFIX,
  },
  {
    type: 'tool_result' as const,
    open: TOOL_RESULT_OPEN,
    close: TOOL_RESULT_CLOSE,
    prefix: TOOL_RESULT_PREFIX,
  },
]

const TAG_INFO_BY_TYPE = Object.fromEntries(
  TAG_DEFINITIONS.map((tag) => [tag.type, tag]),
)

const getPartialStartIndex = (value: string, pattern: string): number => {
  const max = Math.min(pattern.length - 1, value.length)
  for (let len = max; len > 0; len--) {
    const slice = value.slice(value.length - len)
    if (pattern.startsWith(slice)) {
      return value.length - len
    }
  }
  return -1
}

function filterToolXmlFromText(
  state: ToolXmlFilterState,
  incoming: string,
  maxBuffer: number,
): { text: string } {
  if (incoming) {
    state.buffer += incoming
  }

  let sanitized = ''

  while (state.buffer.length > 0) {
    if (state.activeTag == null) {
      let nextTag: {
        index: number
        definition: (typeof TAG_DEFINITIONS)[number]
      } | null = null

      for (const definition of TAG_DEFINITIONS) {
        const index = state.buffer.indexOf(definition.open)
        if (index !== -1) {
          if (nextTag == null || index < nextTag.index) {
            nextTag = { index, definition }
          }
        }
      }

      if (!nextTag) {
        let partialIndex = -1
        for (const definition of TAG_DEFINITIONS) {
          const idx = getPartialStartIndex(state.buffer, definition.prefix)
          if (idx !== -1 && (partialIndex === -1 || idx < partialIndex)) {
            partialIndex = idx
          }
        }

        if (partialIndex === -1) {
          sanitized += state.buffer
          state.buffer = ''
        } else {
          sanitized += state.buffer.slice(0, partialIndex)
          state.buffer = state.buffer.slice(partialIndex)
        }
        break
      }

      sanitized += state.buffer.slice(0, nextTag.index)
      state.buffer = state.buffer.slice(
        nextTag.index + nextTag.definition.open.length,
      )
      state.activeTag = nextTag.definition.type
    } else {
      const definition = TAG_INFO_BY_TYPE[state.activeTag]
      const closeIndex = state.buffer.indexOf(definition.close)

      if (closeIndex === -1) {
        const partialCloseIndex = getPartialStartIndex(
          state.buffer,
          definition.close,
        )
        if (partialCloseIndex === -1) {
          const keepLength = definition.close.length - 1
          if (state.buffer.length > keepLength) {
            state.buffer = state.buffer.slice(
              state.buffer.length - keepLength,
            )
          }
        } else {
          state.buffer = state.buffer.slice(partialCloseIndex)
        }

        if (state.buffer.length > maxBuffer) {
          state.buffer = state.buffer.slice(-maxBuffer)
        }
        break
      }

      state.buffer = state.buffer.slice(
        closeIndex + definition.close.length,
      )
      state.activeTag = null
    }
  }

  if (state.buffer.length > maxBuffer) {
    state.buffer = state.buffer.slice(-maxBuffer)
  }

  return { text: sanitized }
}

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

  handleEvent,
  handleStreamChunk,

  overrideTools,
  customToolDefinitions,

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
  checkAborted(signal)
  async function onError(error: { message: string }) {
    if (handleEvent) {
      await handleEvent({ type: 'error', message: error.message })
    }
  }

  function checkAborted(signal?: AbortSignal) {
    if (signal?.aborted) {
      const error = new Error('Run cancelled by user')
      error.name = 'AbortError'
      throw error
    }
  }

  let resolve: (value: RunReturnType) => any = () => {}
  const promise = new Promise<RunReturnType>((res) => {
    resolve = res
  })

  const BUFFER_SIZE = 100
  const MAX_TOOL_XML_BUFFER = BUFFER_SIZE * 10
  const ROOT_AGENT_KEY = '__root__'

  const streamFilterState: ToolXmlFilterState = { buffer: '', activeTag: null }
  const textFilterStates = new Map<string, ToolXmlFilterState>()

  const subagentFilterStates = new Map<string, ToolXmlFilterState>()

  const getTextFilterState = (agentKey: string): ToolXmlFilterState => {
    let state = textFilterStates.get(agentKey)
    if (!state) {
      state = { buffer: '', activeTag: null }
      textFilterStates.set(agentKey, state)
    }
    return state
  }

  const getSubagentFilterState = (agentId: string): ToolXmlFilterState => {
    let state = subagentFilterStates.get(agentId)
    if (!state) {
      state = { buffer: '', activeTag: null }
      subagentFilterStates.set(agentId, state)
    }
    return state
  }

  const flushTextState = async (
    agentKey: string,
    eventAgentId?: string,
  ): Promise<void> => {
    const state = textFilterStates.get(agentKey)
    if (!state) {
      return
    }

    const { text: pendingText } = filterToolXmlFromText(
      state,
      '',
      MAX_TOOL_XML_BUFFER,
    )
    let remainder = pendingText

    if (state.buffer && !state.buffer.includes('<')) {
      remainder += state.buffer
    }
    state.buffer = ''
    state.activeTag = null

    textFilterStates.delete(agentKey)

    if (remainder) {
      await handleEvent?.({
        type: 'text',
        text: remainder,
        agentId: eventAgentId,
      } as any)
    }
  }

  const flushSubagentState = async (
    agentId: string,
    agentType?: string,
  ): Promise<void> => {
    const state = subagentFilterStates.get(agentId)
    if (!state) {
      return
    }

    const { text: pendingText } = filterToolXmlFromText(
      state,
      '',
      MAX_TOOL_XML_BUFFER,
    )

    subagentFilterStates.delete(agentId)
    state.buffer = ''
    state.activeTag = null

    const trimmed = pendingText.trim()
    if (trimmed) {
      await handleEvent?.({
        type: 'subagent-chunk',
        agentId,
        agentType,
        chunk: pendingText,
      } as any)
    }
  }

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
      checkAborted(signal)
      const { chunk } = action
      if (typeof chunk === 'string') {
        const { text: sanitized } = filterToolXmlFromText(
          streamFilterState,
          chunk,
          MAX_TOOL_XML_BUFFER,
        )

        if (sanitized) {
          await handleStreamChunk?.(sanitized)
        }
      } else if (chunk.type === 'text') {
        const agentKey = chunk.agentId ?? ROOT_AGENT_KEY
        const state = getTextFilterState(agentKey)
        const { text: sanitized } = filterToolXmlFromText(
          state,
          chunk.text,
          MAX_TOOL_XML_BUFFER,
        )

        if (sanitized) {
          await handleEvent?.({
            ...chunk,
            text: sanitized,
          })
        }
      } else {
        const chunkType = chunk.type as string

        if (chunkType === 'finish') {
          const { text: streamTail } = filterToolXmlFromText(
            streamFilterState,
            '',
            MAX_TOOL_XML_BUFFER,
          )
          let remainder = streamTail

          if (streamFilterState.buffer && !streamFilterState.buffer.includes('<')) {
            remainder += streamFilterState.buffer
          }
          streamFilterState.buffer = ''
          streamFilterState.activeTag = null

          if (remainder) {
            await handleStreamChunk?.(remainder)
          }

          await flushTextState(ROOT_AGENT_KEY)

          const finishAgentKey =
            (chunk as typeof chunk & { agentId?: string }).agentId
          if (finishAgentKey && finishAgentKey !== ROOT_AGENT_KEY) {
            await flushTextState(finishAgentKey, finishAgentKey)
            await flushSubagentState(
              finishAgentKey,
              (chunk as { agentType?: string }).agentType,
            )
          }
        } else if (
          chunkType === 'subagent_finish' ||
          chunkType === 'subagent-finish'
        ) {
          const subagentId = (chunk as { agentId?: string }).agentId
          if (subagentId) {
            await flushTextState(subagentId, subagentId)
            await flushSubagentState(
              subagentId,
              (chunk as { agentType?: string }).agentType,
            )
          }
        }

        await handleEvent?.(chunk)
      }
    },
    onSubagentResponseChunk: async (action) => {
      checkAborted(signal)
      const { agentId, agentType, chunk } = action

      const state = getSubagentFilterState(agentId)
      const { text: sanitized } = filterToolXmlFromText(
        state,
        chunk,
        MAX_TOOL_XML_BUFFER,
      )

      if (sanitized && handleEvent) {
        await handleEvent({
          type: 'subagent-chunk',
          agentId,
          agentType,
          chunk: sanitized,
        } as any)
      }
    },

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
  checkAborted(signal)
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
