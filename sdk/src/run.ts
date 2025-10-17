import path from 'path'

import { cloneDeep } from 'lodash'

import { initialSessionState, applyOverridesToSessionState } from './run-state'
import { stripToolCallPayloads } from './tool-xml-buffer'
import {
  createToolXmlFilterState,
  filterToolXmlFromText,
} from './tool-xml-filter'
import { changeFile } from './tools/change-file'
import { codeSearch } from './tools/code-search'
import { glob } from './tools/glob'
import { listDirectory } from './tools/list-directory'
import { getFiles } from './tools/read-files'
import { runTerminalCommand } from './tools/run-terminal-command'
import { WebSocketHandler } from './websocket-client'
import { MAX_AGENT_STEPS_DEFAULT } from '../../common/src/constants/agents'
import { toolNames } from '../../common/src/tools/constants'
import { clientToolCallSchema } from '../../common/src/tools/list'
import { AgentOutputSchema } from '../../common/src/types/session-state'

import type { CustomToolDefinition } from './custom-tool'
import type { RunState } from './run-state'
import type { ToolXmlFilterState } from './tool-xml-filter'
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
import type { SessionState } from '../../common/src/types/session-state'
import type { Source } from '../../common/src/types/source'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

type TextPrintEvent = Extract<PrintModeEvent, { type: 'text' }>

export type CodebuffClientOptions = {
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

  fsSource?: Source<CodebuffFileSystem>
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

  fsSource = () => require('fs'),

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

  const streamFilterState = createToolXmlFilterState()
  const textFilterStates = new Map<string, ToolXmlFilterState>()
  const textAccumulator = new Map<string, string>()
  const lastStreamedTextByAgent = new Map<string, string>()
  const lastTextEventByAgent = new Map<string, TextPrintEvent>()
  const sectionStartIndexByAgent = new Map<string, number>()

  const subagentFilterStates = new Map<string, ToolXmlFilterState>()

  const getTextFilterState = (agentKey: string): ToolXmlFilterState => {
    let state = textFilterStates.get(agentKey)
    if (!state) {
      state = createToolXmlFilterState()
      textFilterStates.set(agentKey, state)
    }
    return state
  }

  const getSubagentFilterState = (agentId: string): ToolXmlFilterState => {
    let state = subagentFilterStates.get(agentId)
    if (!state) {
      state = createToolXmlFilterState()
      subagentFilterStates.set(agentId, state)
    }
    return state
  }

  const getCommonPrefixLength = (a: string, b: string): number => {
    const max = Math.min(a.length, b.length)
    let index = 0
    while (index < max && a[index] === b[index]) {
      index++
    }
    return index
  }

  const accumulateText = (agentKey: string, incoming: string): string => {
    if (!incoming) {
      return textAccumulator.get(agentKey) ?? ''
    }

    const previous = textAccumulator.get(agentKey) ?? ''
    let next: string

    if (!previous) {
      next = incoming
    } else if (incoming.startsWith(previous)) {
      next = incoming
    } else if (previous.startsWith(incoming)) {
      next = incoming
      sectionStartIndexByAgent.set(agentKey, 0)
    } else if (
      incoming.length >= previous.length &&
      incoming.includes(previous)
    ) {
      next = incoming
    } else if (
      incoming.length < previous.length &&
      !previous.includes(incoming)
    ) {
      next = incoming
      sectionStartIndexByAgent.set(agentKey, 0)
    } else {
      next = previous + incoming
    }

    const sanitizedNext = stripToolCallPayloads(next)

    textAccumulator.set(agentKey, sanitizedNext)
    return sanitizedNext
  }

  const emitStreamDelta = async (
    agentKey: string,
    nextFullText: string,
  ): Promise<void> => {
    const previous = lastStreamedTextByAgent.get(agentKey) ?? ''

    if (nextFullText === previous) {
      return
    }

    let delta = ''

    if (nextFullText.startsWith(previous)) {
      delta = nextFullText.slice(previous.length)
    } else if (previous.startsWith(nextFullText)) {
      delta = ''
    } else {
      const prefixLength = getCommonPrefixLength(previous, nextFullText)
      delta = nextFullText.slice(prefixLength)
    }

    if (delta) {
      await handleStreamChunk?.(delta)
    }

    lastStreamedTextByAgent.set(agentKey, nextFullText)
  }

  const resolveAgentId = (
    agentKey: string,
    agentIdHint?: string | null,
  ): string | undefined =>
    agentIdHint ?? (agentKey === ROOT_AGENT_KEY ? undefined : agentKey)

  const ensureSectionStart = (agentKey: string): number => {
    if (!sectionStartIndexByAgent.has(agentKey)) {
      const currentLength = textAccumulator.get(agentKey)?.length ?? 0
      sectionStartIndexByAgent.set(agentKey, currentLength)
      return currentLength
    }
    return sectionStartIndexByAgent.get(agentKey) ?? 0
  }

  const emitTextSection = async (
    agentKey: string,
    text: string,
    agentIdHint?: string | null,
  ): Promise<void> => {
    if (!text) {
      return
    }

    const eventAgentId = resolveAgentId(agentKey, agentIdHint)
    const lastChunk = lastTextEventByAgent.get(agentKey)

    let eventPayload: PrintModeEvent
    if (lastChunk) {
      eventPayload = { ...lastChunk, text }

      if (
        eventAgentId &&
        (!('agentId' in eventPayload) ||
          (eventPayload as { agentId?: string | null }).agentId == null)
      ) {
        const eventWithAgent = eventPayload as { agentId?: string }
        eventWithAgent.agentId = eventAgentId
      }
    } else {
      eventPayload = {
        type: 'text',
        text,
      } as PrintModeEvent

      if (eventAgentId) {
        const eventWithAgent = eventPayload as { agentId?: string }
        eventWithAgent.agentId = eventAgentId
      }
    }

    await handleEvent?.(eventPayload)
  }

  const emitPendingSection = async (
    agentKey: string,
    agentIdHint?: string | null,
  ): Promise<void> => {
    const fullText = textAccumulator.get(agentKey) ?? ''
    const startIndex = sectionStartIndexByAgent.get(agentKey) ?? fullText.length

    if (startIndex >= fullText.length) {
      return
    }

    const sectionText = fullText.slice(startIndex)
    await emitTextSection(agentKey, sectionText, agentIdHint)
    sectionStartIndexByAgent.set(agentKey, fullText.length)
  }

  const flushTextState = async (
    agentKey: string,
    eventAgentId?: string,
  ): Promise<void> => {
    const state = textFilterStates.get(agentKey)
    let pending = ''

    if (state) {
      const { text: pendingText } = filterToolXmlFromText(
        state,
        '',
        MAX_TOOL_XML_BUFFER,
      )
      pending = pendingText

      if (state.buffer && !state.buffer.includes('<')) {
        pending += state.buffer
      }

      state.buffer = ''
      state.activeTag = null

      textFilterStates.delete(agentKey)
    } else {
      ensureSectionStart(agentKey)
    }

    let nextFullText = textAccumulator.get(agentKey) ?? ''
    ensureSectionStart(agentKey)

    if (pending) {
      nextFullText = accumulateText(agentKey, pending)
      if (agentKey === ROOT_AGENT_KEY) {
        await emitStreamDelta(agentKey, nextFullText)
      }
    }

    await emitPendingSection(agentKey, eventAgentId)

    textAccumulator.delete(agentKey)
    lastStreamedTextByAgent.delete(agentKey)
    sectionStartIndexByAgent.delete(agentKey)

    lastTextEventByAgent.delete(agentKey)
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
        fs,
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
        fs,
      }),
    onCostResponse: async () => {},

    onResponseChunk: async (action) => {
      checkAborted(signal)
      const { chunk } = action
      if (typeof chunk === 'string') {
        ensureSectionStart(ROOT_AGENT_KEY)
        const { text: sanitized } = filterToolXmlFromText(
          streamFilterState,
          chunk,
          MAX_TOOL_XML_BUFFER,
        )

        if (sanitized) {
          const nextFullText = accumulateText(ROOT_AGENT_KEY, sanitized)
          await emitStreamDelta(ROOT_AGENT_KEY, nextFullText)
        }
      } else if (chunk.type === 'text') {
        const agentKey = chunk.agentId ?? ROOT_AGENT_KEY
        const state = getTextFilterState(agentKey)
        lastTextEventByAgent.set(agentKey, { ...chunk })
        ensureSectionStart(agentKey)
        const { text: sanitized } = filterToolXmlFromText(
          state,
          chunk.text,
          MAX_TOOL_XML_BUFFER,
        )

        if (sanitized) {
          const nextFullText = accumulateText(agentKey, sanitized)
          if (agentKey === ROOT_AGENT_KEY) {
            await emitStreamDelta(agentKey, nextFullText)
          }
        }
        await emitPendingSection(agentKey, chunk.agentId)
      } else {
        const chunkType = chunk.type as string

        if (
          chunkType !== 'finish' &&
          chunkType !== 'subagent_finish' &&
          chunkType !== 'subagent-finish'
        ) {
          await emitPendingSection(ROOT_AGENT_KEY)
          const pendingAgentId =
            'agentId' in chunk ? chunk.agentId : undefined
          if (pendingAgentId && pendingAgentId !== ROOT_AGENT_KEY) {
            await emitPendingSection(pendingAgentId, pendingAgentId)
          }
        }

        if (chunkType === 'finish') {
          const { text: streamTail } = filterToolXmlFromText(
            streamFilterState,
            '',
            MAX_TOOL_XML_BUFFER,
          )
          let remainder = streamTail

          if (
            streamFilterState.buffer &&
            !streamFilterState.buffer.includes('<')
          ) {
            remainder += streamFilterState.buffer
          }
          streamFilterState.buffer = ''
          streamFilterState.activeTag = null

          if (remainder) {
            const nextFullText = accumulateText(ROOT_AGENT_KEY, remainder)
            await emitStreamDelta(ROOT_AGENT_KEY, nextFullText)
          }

          await flushTextState(ROOT_AGENT_KEY)

          const finishAgentKey = 'agentId' in chunk ? chunk.agentId : undefined
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
          const subagentId = 'agentId' in chunk ? chunk.agentId : undefined
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
    sessionState = await initialSessionState({
      cwd,
      knowledgeFiles,
      agentDefinitions,
      customToolDefinitions,
      projectFiles,
      maxAgentSteps,
      fs,
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
}: {
  action: ServerAction<'tool-call-request'>
  overrides: NonNullable<CodebuffClientOptions['overrideTools']>
  customToolDefinitions: Record<string, CustomToolDefinition>
  cwd?: string
  fs: CodebuffFileSystem
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
      result = changeFile({
        parameters: input,
        cwd: requireCwd(cwd, toolName),
        fs,
      })
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
