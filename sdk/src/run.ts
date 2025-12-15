import path from 'path'

import { callMainPrompt } from '@codebuff/agent-runtime/main-prompt'
import {
  buildUserMessageContent,
  getCancelledAdditionalMessages,
} from '@codebuff/agent-runtime/util/messages'
import { MAX_AGENT_STEPS_DEFAULT } from '@codebuff/common/constants/agents'
import { getMCPClient, listMCPTools } from '@codebuff/common/mcp/client'
import { toOptionalFile } from '@codebuff/common/old-constants'
import { toolNames } from '@codebuff/common/tools/constants'
import { clientToolCallSchema } from '@codebuff/common/tools/list'
import { AgentOutputSchema } from '@codebuff/common/types/session-state'
import { getErrorObject } from '@codebuff/common/util/error'
import { cloneDeep } from 'lodash'

import {
  RETRYABLE_ERROR_CODES,
  isNetworkError,
  isPaymentRequiredError,
  ErrorCodes,
  NetworkError,
  sanitizeErrorMessage,
} from './errors'
import { getAgentRuntimeImpl } from './impl/agent-runtime'
import { getUserInfoFromApiKey } from './impl/database'
import {
  MAX_RETRIES_PER_MESSAGE,
  RETRY_BACKOFF_BASE_DELAY_MS,
  RETRY_BACKOFF_MAX_DELAY_MS,
} from './retry-config'
import { initialSessionState, applyOverridesToSessionState } from './run-state'
import { filterXml } from './tool-xml-filter'
import { changeFile } from './tools/change-file'
import { codeSearch } from './tools/code-search'
import { glob } from './tools/glob'
import { listDirectory } from './tools/list-directory'
import { getFiles } from './tools/read-files'
import { runTerminalCommand } from './tools/run-terminal-command'

import type { CustomToolDefinition } from './custom-tool'
import type { ErrorCode } from './errors'
import type { RunState } from './run-state'
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
import type {
  ImagePart,
  TextPart,
  ToolResultOutput,
} from '@codebuff/common/types/messages/content-part'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { SessionState } from '@codebuff/common/types/session-state'
import type { Source } from '@codebuff/common/types/source'
import type { CodebuffSpawn } from '@codebuff/common/types/spawn'

/**
 * Wraps content for user messages, ensuring text is wrapped in <user_message> tags.
 * Uses buildUserMessageContent from agent-runtime for consistency.
 */
const wrapContentForUserMessage = (
  content?: (TextPart | ImagePart)[],
): (TextPart | ImagePart)[] | undefined => {
  if (!content || content.length === 0) {
    return content
  }
  // Delegate to the shared utility which handles wrapping correctly
  return buildUserMessageContent(undefined, undefined, content)
}

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

export type RetryOptions = {
  /**
   * Maximum number of retry attempts after the initial failure.
   * A value of 0 disables retries.
   */
  maxRetries?: number
  /**
   * Base delay in milliseconds for exponential backoff.
   */
  backoffBaseMs?: number
  /**
   * Maximum delay in milliseconds for exponential backoff.
   */
  backoffMaxMs?: number
  /**
   * Error codes that should trigger retry.
   * Defaults to RETRYABLE_ERROR_CODES.
   */
  retryableErrorCodes?: Set<ErrorCode>
  /**
   * Optional callback invoked before each retry attempt.
   */
  onRetry?: (params: {
    attempt: number
    error: unknown
    delayMs: number
    errorCode?: ErrorCode
  }) => void | Promise<void>
  /**
   * Optional callback invoked when all SDK retries are exhausted.
   * This allows the caller to be notified before the error is thrown.
   */
  onRetryExhausted?: (params: {
    totalAttempts: number
    error: unknown
    errorCode?: ErrorCode
  }) => void | Promise<void>
}

export type ImageContent = {
  type: 'image'
  image: string // base64 encoded
  mediaType: string
}

export type TextContent = {
  type: 'text'
  text: string
}

export type MessageContent = TextContent | ImageContent

export type RunOptions = {
  agent: string | AgentDefinition
  prompt: string
  /** Content array for multimodal messages (text + images) */
  content?: MessageContent[]
  params?: Record<string, any>
  previousRun?: RunState
  extraToolResults?: ToolMessage[]
  signal?: AbortSignal
  abortController?: AbortController
  retry?: boolean | RetryOptions
}

type NormalizedRetryOptions = {
  maxRetries: number
  backoffBaseMs: number
  backoffMaxMs: number
  retryableErrorCodes: Set<ErrorCode>
  onRetry?: (params: {
    attempt: number
    error: unknown
    delayMs: number
    errorCode?: ErrorCode
  }) => void | Promise<void>
  onRetryExhausted?: (params: {
    totalAttempts: number
    error: unknown
    errorCode?: ErrorCode
  }) => void | Promise<void>
}

const defaultRetryOptions: NormalizedRetryOptions = {
  maxRetries: MAX_RETRIES_PER_MESSAGE,
  backoffBaseMs: RETRY_BACKOFF_BASE_DELAY_MS,
  backoffMaxMs: RETRY_BACKOFF_MAX_DELAY_MS,
  retryableErrorCodes: RETRYABLE_ERROR_CODES,
}

const createAbortError = (signal?: AbortSignal) => {
  if (signal?.reason instanceof Error) {
    return signal.reason
  }
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

/**
 * Checks if an error should trigger a retry attempt.
 */
const isRetryableError = (error: unknown): boolean => {
  return isNetworkError(error) && RETRYABLE_ERROR_CODES.has(error.code)
}

const normalizeRetryOptions = (
  retry: RunOptions['retry'],
): NormalizedRetryOptions => {
  if (!retry) {
    return { ...defaultRetryOptions, maxRetries: 0 }
  }
  if (retry === true) {
    return { ...defaultRetryOptions }
  }
  return {
    maxRetries: retry.maxRetries ?? defaultRetryOptions.maxRetries,
    backoffBaseMs: retry.backoffBaseMs ?? defaultRetryOptions.backoffBaseMs,
    backoffMaxMs: retry.backoffMaxMs ?? defaultRetryOptions.backoffMaxMs,
    retryableErrorCodes:
      retry.retryableErrorCodes ?? defaultRetryOptions.retryableErrorCodes,
    onRetry: retry.onRetry,
    onRetryExhausted: retry.onRetryExhausted,
  }
}

const waitWithAbort = (delayMs: number, signal?: AbortSignal) => {
  if (delayMs <= 0) return Promise.resolve()

  return new Promise<void>((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout>

    const onAbort = () => {
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', onAbort)
      reject(createAbortError(signal))
    }

    timeoutId = setTimeout(() => {
      if (signal) {
        signal.removeEventListener('abort', onAbort)
      }
      resolve()
    }, delayMs)

    if (!signal) {
      return
    }

    if (signal.aborted) {
      onAbort()
      return
    }

    signal.addEventListener('abort', onAbort, { once: true })
  })
}

type RunExecutionOptions = RunOptions &
  CodebuffClientOptions & {
    apiKey: string
    fingerprintId: string
  }
type RunOnceOptions = Omit<RunExecutionOptions, 'retry' | 'abortController'>
type RunReturnType = RunState

export async function run(options: RunExecutionOptions): Promise<RunState> {
  const { retry, abortController, ...rest } = options
  const retryOptions = normalizeRetryOptions(retry)

  // Prefer provided signal; otherwise reuse a shared controller across retries.
  const sharedController =
    abortController ?? (rest.signal ? undefined : new AbortController())
  const signal = rest.signal ?? sharedController?.signal

  let attemptIndex = 0
  while (true) {
    if (signal?.aborted) {
      // Return error output for abort instead of throwing
      const abortError = createAbortError(signal)
      return {
        sessionState: rest.previousRun?.sessionState,
        output: {
          type: 'error',
          message: abortError.message,
        },
      }
    }

    try {
      const result = await runOnce({
        ...rest,
        signal,
      })

      // Check if result contains a retryable error in the output
      if (result.output.type === 'error') {
        const retryableCode = getRetryableErrorCode(result.output.message)
        const canRetry =
          retryableCode &&
          attemptIndex < retryOptions.maxRetries &&
          retryOptions.retryableErrorCodes.has(retryableCode)

        if (canRetry) {
          // Treat this as a retryable error - continue retry loop
          const delayMs = Math.min(
            retryOptions.backoffBaseMs * Math.pow(2, attemptIndex),
            retryOptions.backoffMaxMs,
          )

          // Log retry attempt with full context
          if (rest.logger) {
            rest.logger.warn(
              {
                attempt: attemptIndex + 1,
                maxRetries: retryOptions.maxRetries,
                delayMs,
                errorCode: retryableCode,
                errorMessage: result.output.message,
              },
              'SDK retrying after error',
            )
          }

          await retryOptions.onRetry?.({
            attempt: attemptIndex + 1,
            error: new Error(result.output.message),
            delayMs,
            errorCode: retryableCode,
          })

          await waitWithAbort(delayMs, signal)
          attemptIndex++
          continue
        } else if (attemptIndex > 0) {
          // Non-retryable error or exhausted retries
          if (rest.logger) {
            rest.logger.warn(
              {
                attemptIndex,
                totalAttempts: attemptIndex + 1,
                errorCode: retryableCode,
              },
              'SDK exhausted all retries',
            )
          }

          await retryOptions.onRetryExhausted?.({
            totalAttempts: attemptIndex + 1,
            error: new Error(result.output.message),
            errorCode: retryableCode ?? undefined,
          })
        }
      }

      // Log successful completion after retries
      if (attemptIndex > 0 && rest.logger) {
        rest.logger.info(
          { attemptIndex, totalAttempts: attemptIndex + 1 },
          'SDK run succeeded after retries',
        )
      }

      return result
    } catch (error) {
      // Handle unexpected exceptions by converting to error output
      if (signal?.aborted) {
        const abortError = createAbortError(signal)
        return {
          sessionState: rest.previousRun?.sessionState,
          output: {
            type: 'error',
            message: abortError.message,
          },
        }
      }

      // Unexpected exception - convert to error output and check if retryable
      // Use sanitizeErrorMessage to get clean user-facing message without stack traces
      const errorMessage = sanitizeErrorMessage(error)
      const errorCode = isNetworkError(error)
        ? error.code
        : isPaymentRequiredError(error)
          ? error.code
          : undefined
      const retryableCode = errorCode ?? getRetryableErrorCode(errorMessage)

      const canRetry =
        retryableCode &&
        attemptIndex < retryOptions.maxRetries &&
        retryOptions.retryableErrorCodes.has(retryableCode)

      if (rest.logger) {
        rest.logger.error(
          {
            attemptIndex,
            errorCode: retryableCode,
            canRetry,
            error: errorMessage,
          },
          'Unexpected exception in SDK run',
        )
      }

      if (!canRetry) {
        // Can't retry - convert to error output and return
        if (attemptIndex > 0 && rest.logger) {
          rest.logger.warn(
            {
              attemptIndex,
              totalAttempts: attemptIndex + 1,
            },
            'SDK exhausted all retries after unexpected exception',
          )
        }

        // Return error output instead of throwing
        return {
          sessionState: rest.previousRun?.sessionState,
          output: {
            type: 'error',
            message: errorMessage,
            ...(errorCode && { errorCode }),
          },
        }
      }

      // Exception is retryable - trigger retry
      const delayMs = Math.min(
        retryOptions.backoffBaseMs * Math.pow(2, attemptIndex),
        retryOptions.backoffMaxMs,
      )

      if (rest.logger) {
        rest.logger.warn(
          {
            attempt: attemptIndex + 1,
            maxRetries: retryOptions.maxRetries,
            delayMs,
            errorCode: retryableCode,
            errorMessage,
          },
          'SDK retrying after unexpected exception',
        )
      }

      await retryOptions.onRetry?.({
        attempt: attemptIndex + 1,
        error: error instanceof Error ? error : new Error(errorMessage),
        delayMs,
        errorCode: retryableCode,
      })

      await waitWithAbort(delayMs, signal)
      attemptIndex++
    }
  }
}

export async function runOnce({
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
  content,
  params,
  previousRun,
  extraToolResults,
  signal,
}: RunOnceOptions): Promise<RunState> {
  const fs = await (typeof fsSource === 'function' ? fsSource() : fsSource)
  const spawn: CodebuffSpawn = (
    spawnSource ? await spawnSource : require('child_process').spawn
  ) as CodebuffSpawn
  const preparedContent = wrapContentForUserMessage(content)

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
  let reject: (error: any) => any = () => {}
  const promise = new Promise<RunReturnType>((res, rej) => {
    resolve = res
    reject = rej
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
        content: preparedContent,
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
    addToPendingAssistantMessage: if (typeof chunk === 'string') {
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

    if (handleStreamChunk) {
      const stream = filterXml({
        chunk,
        buffer: buffers[0],
      })
      while (true) {
        const { value, done } = stream.next()
        if (done) {
          buffers[0] = value.buffer
          break
        }

        if (value.chunk) {
          await handleStreamChunk(value.chunk)
        }
      }
    }
  }
  const onSubagentResponseChunk = async (
    action: ServerAction<'subagent-response-chunk'>,
  ) => {
    if (signal?.aborted) {
      return
    }
    const { agentId, agentType, chunk } = action

    if (handleStreamChunk) {
      const stream = filterXml({
        chunk,
        buffer: buffers[agentId] ?? '',
      })
      while (true) {
        const { value, done } = stream.next()
        if (done) {
          buffers[agentId] = value.buffer
          break
        }
        await handleStreamChunk({
          type: 'subagent_chunk',
          agentId,
          agentType,
          chunk: value.chunk,
        })
      }
    }
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
      content: preparedContent,
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
  }).catch((error) => {
    // Let retryable errors and PaymentRequiredError propagate so the retry wrapper can handle them
    const isRetryable = isRetryableError(error)
    const isPaymentRequired = isPaymentRequiredError(error)
    logger?.warn(
      {
        isNetworkError: isNetworkError(error),
        isPaymentRequired,
        errorCode: isNetworkError(error)
          ? error.code
          : isPaymentRequired
            ? error.code
            : undefined,
        isRetryable,
        error: getErrorObject(error),
      },
      'callMainPrompt caught error, checking if retryable',
    )

    if (isRetryable || isPaymentRequired) {
      // Reject the promise so the retry wrapper can catch it and include the error code
      reject(error)
      return
    }

    // For non-retryable errors, resolve with cancelled state
    const errorMessage =
      error instanceof Error ? error.message : String(error ?? '')
    resolve(getCancelledRunState(errorMessage))
  })

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
}): Promise<{ output: ToolResultOutput[] }> {
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
      result = [{ type: 'json', value: { message: 'Turn ended.' } }]
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

/**
 * Extracts an error code from a prompt error message.
 * Returns the appropriate ErrorCode if the error is retryable, null otherwise.
 */
export const getRetryableErrorCode = (
  errorMessage: string,
): ErrorCode | null => {
  const lowerMessage = errorMessage.toLowerCase()

  // AI SDK's built-in retry error (e.g., "Failed after 4 attempts. Last error: Service Unavailable")
  // The AI SDK already retried 4 times, but we still want our SDK wrapper to retry 3 more times
  if (
    lowerMessage.includes('failed after') &&
    lowerMessage.includes('attempts')
  ) {
    // Extract the underlying error type from the message
    if (lowerMessage.includes('service unavailable')) {
      return ErrorCodes.SERVICE_UNAVAILABLE
    }
    if (lowerMessage.includes('timeout')) {
      return ErrorCodes.TIMEOUT
    }
    if (lowerMessage.includes('connection refused')) {
      return ErrorCodes.CONNECTION_REFUSED
    }
    // Default to SERVER_ERROR for other AI SDK retry failures
    return ErrorCodes.SERVER_ERROR
  }

  if (
    errorMessage.includes('503') ||
    lowerMessage.includes('service unavailable')
  ) {
    return ErrorCodes.SERVICE_UNAVAILABLE
  }
  if (lowerMessage.includes('timeout')) {
    return ErrorCodes.TIMEOUT
  }
  if (
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('connection refused')
  ) {
    return ErrorCodes.CONNECTION_REFUSED
  }
  if (lowerMessage.includes('dns') || lowerMessage.includes('enotfound')) {
    return ErrorCodes.DNS_FAILURE
  }
  if (
    lowerMessage.includes('server error') ||
    lowerMessage.includes('500') ||
    lowerMessage.includes('502') ||
    lowerMessage.includes('504')
  ) {
    return ErrorCodes.SERVER_ERROR
  }
  if (
    lowerMessage.includes('network error') ||
    lowerMessage.includes('fetch failed')
  ) {
    return ErrorCodes.NETWORK_ERROR
  }

  return null
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

    // If this is a retryable error, throw NetworkError so retry wrapper can handle it
    const retryableCode = getRetryableErrorCode(action.message)
    if (retryableCode) {
      throw new NetworkError(action.message, retryableCode)
    }

    // For non-retryable errors, resolve with error state
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
