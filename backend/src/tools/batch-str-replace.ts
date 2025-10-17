import { withRetry, withTimeout } from '@codebuff/common/util/promise'
import { env } from '@codebuff/internal/env'
import { Benchify } from 'benchify'

import { handleStrReplace } from './handlers/tool/str-replace'
import { getFileProcessingValues } from './handlers/tool/write-file'

import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type {
  RequestFilesFn,
  RequestToolCallFn,
} from '@codebuff/common/types/contracts/client'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  ParamsExcluding,
  ParamsOf,
} from '@codebuff/common/types/function-params'
import type { ToolResultPart } from '@codebuff/common/types/messages/content-part'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

export type DeferredStrReplace = {
  toolCall: CodebuffToolCall<'str_replace'>
}

export type BatchStrReplaceState = {
  deferredStrReplaces: DeferredStrReplace[]
  otherToolsQueue: any[]
  strReplacePhaseComplete: boolean
  failures: any[]
}

const BENCHIFY_FILE_TYPES = ['tsx', 'ts', 'jsx', 'js']
const BENCHIFY_TIMEOUT_MS = 3000 // 3 second timeout for Benchify calls
const BENCHIFY_MAX_FILES = 10 // Maximum files to send to Benchify
const BENCHIFY_MAX_FILE_SIZE = 1024 * 1024 // 1MB max file size

// Global Benchify client instance
let benchifyClient: Benchify | null = null

// Circuit breaker state for Benchify
let benchifyCircuitBreaker = {
  failureCount: 0,
  lastFailureTime: 0,
  isOpen: false,
  openUntil: 0,
}

const CIRCUIT_BREAKER_THRESHOLD = 3 // Open circuit after 3 consecutive failures
const CIRCUIT_BREAKER_TIMEOUT = 60000 // Keep circuit open for 1 minute

export function getBenchifyClient(params: { logger: Logger }): Benchify | null {
  const { logger } = params
  if (!benchifyClient) {
    let benchifyApiKey: string | undefined
    try {
      benchifyApiKey = env.BENCHIFY_API_KEY
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to access BENCHIFY_API_KEY from environment',
      )
      return null
    }

    if (!benchifyApiKey) {
      return null
    }

    benchifyClient = new Benchify({
      apiKey: benchifyApiKey,
    })
  }
  return benchifyClient
}

type BatchContext = {
  userInputId: string
  onResponseChunk: (chunk: string | PrintModeEvent) => void
  state: Record<string, any>
  originalContents: Record<string, string>
  editedFiles: Record<string, string>
  intendedChanges: Record<string, string>
}

export async function executeBatchStrReplaces(
  params: {
    deferredStrReplaces: DeferredStrReplace[]
    agentStepId: string
    logger: Logger
  } & ParamsExcluding<
    typeof applyBenchifyIfNeeded,
    'originalContents' | 'editedFiles' | 'intendedChanges' | 'toolCalls'
  > &
    ParamsOf<typeof createRequestClientToolCall> &
    ParamsExcluding<typeof preloadOriginalContent, 'operationsByPath'> &
    ParamsExcluding<
      typeof processPathOperations,
      'operations' | 'editedFiles' | 'requestClientToolCall'
    >,
) {
  const { deferredStrReplaces, agentStepId, logger } = params

  if (deferredStrReplaces.length === 0) {
    return
  }

  // Group operations by file path for per-path processing
  const operationsByPath: Record<string, DeferredStrReplace[]> = {}
  for (const operation of deferredStrReplaces) {
    const path = operation.toolCall.input.path
    if (!operationsByPath[path]) {
      operationsByPath[path] = []
    }
    operationsByPath[path].push(operation)
  }

  // Pre-load original content for all paths that support benchify
  const originalContents = await preloadOriginalContent({
    ...params,
    operationsByPath,
  })

  // Extract intended changes for benchify (before execution)
  const intendedChanges = await extractAllIntendedChanges({
    operationsByPath,
    originalContents,
    logger,
  })

  // Track edited files during processing
  const editedFiles: Record<string, string> = {}

  // Create the requestClientToolCall function once for all operations
  const requestClientToolCall = createRequestClientToolCall(params)

  // Execute operations grouped by path for better parallelization
  const pathPromises: Record<string, Promise<void>> = {}

  for (const [path, operations] of Object.entries(operationsByPath)) {
    pathPromises[path] = processPathOperations({
      ...params,
      operations,
      editedFiles,
      requestClientToolCall,
    })
  }

  // Wait for all path-based operations to complete
  await Promise.all(Object.values(pathPromises))

  // Apply benchify if we have intended changes
  await applyBenchifyIfNeeded({
    ...params,
    originalContents,
    editedFiles,
    intendedChanges,
    toolCalls: deferredStrReplaces.map((d) => d.toolCall),
  })
  logger.debug({ agentStepId }, 'Completed batch processing')
}

/**
 * Pre-loads original file content for all paths that support benchify
 * Returns a record of path to content for files that were successfully loaded
 */
async function preloadOriginalContent(params: {
  operationsByPath: Record<string, DeferredStrReplace[]>
  requestFiles: RequestFilesFn
  logger: Logger
}): Promise<Record<string, string>> {
  const { operationsByPath, requestFiles, logger } = params

  const pathsToLoad = Object.keys(operationsByPath).filter(
    benchifyCanFixLanguage,
  )

  if (pathsToLoad.length === 0) {
    return {}
  }

  try {
    // Request all files from the client in one batch
    const fileContents = await requestFiles({ filePaths: pathsToLoad })

    // Filter out null values and return only successfully loaded files
    const loadedContents: Record<string, string> = {}
    for (const [path, content] of Object.entries(fileContents)) {
      if (content !== null) {
        loadedContents[path] = content
      }
    }
    return loadedContents
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        pathsToLoad,
      },
      'Failed to read original content for benchify',
    )
    return {}
  }
}

/**
 * Extracts intended changes for all operations (for benchify)
 * Returns an object mapping path to intended content after all operations are applied
 */
async function extractAllIntendedChanges(params: {
  operationsByPath: Record<string, DeferredStrReplace[]>
  originalContents: Record<string, string>
  logger: Logger
}): Promise<Record<string, string>> {
  const { operationsByPath, originalContents, logger } = params
  const intendedChanges: Record<string, string> = {}

  for (const [path, operations] of Object.entries(operationsByPath)) {
    if (!benchifyCanFixLanguage(path) || !originalContents[path]) {
      continue
    }

    try {
      let currentContent = originalContents[path]

      // Apply all operations sequentially to get final intended content
      for (const { toolCall } of operations) {
        currentContent =
          (await extractIntendedContent({
            toolCall,
            currentContent,
            logger,
          })) || currentContent
      }

      intendedChanges[path] = currentContent
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error), path },
        'Failed to extract intended content for benchify',
      )
    }
  }

  return intendedChanges
}

/**
 * Processes all operations for a single file path sequentially
 */
async function processPathOperations(
  params: {
    operations: DeferredStrReplace[]
  } & ParamsExcluding<
    typeof executeSingleStrReplace,
    'toolCall' | 'operationIndex' | 'totalOperations'
  >,
) {
  const { operations } = params
  let previousPromise = Promise.resolve()

  for (let i = 0; i < operations.length; i++) {
    const { toolCall } = operations[i]

    previousPromise = previousPromise.then(() =>
      executeSingleStrReplace({
        ...params,
        toolCall,
        operationIndex: i + 1,
        totalOperations: operations.length,
      }),
    )
  }

  await previousPromise
}

/**
 * Executes a single str_replace operation with proper error handling
 */
async function executeSingleStrReplace(
  params: {
    toolCall: CodebuffToolCall<'str_replace'>
    operationIndex: number
    totalOperations: number
    toolCalls: (CodebuffToolCall | any)[]
    toolResults: ToolResultPart[]
    agentStepId: string
    userInputId: string
    onResponseChunk: (chunk: string | PrintModeEvent) => void
    state: Record<string, any>
    editedFiles: Record<string, string>
    requestClientToolCall: (
      clientToolCall: any,
    ) => Promise<CodebuffToolOutput<'str_replace'>>
    logger: Logger
  } & ParamsExcluding<
    typeof handleStrReplace,
    'previousToolCallFinished' | 'writeToClient' | 'getLatestState' | 'state'
  >,
) {
  const {
    toolCall,
    operationIndex,
    totalOperations,
    userInputId,
    onResponseChunk,
    state,
    editedFiles,
    toolCalls,
    toolResults,
    agentStepId,
    logger,
  } = params

  try {
    // Create isolated state for each operation
    const isolatedState = {
      ...state,
      promisesByPath: {},
      allPromises: [],
      fileChangeErrors: [],
      fileChanges: [],
      firstFileProcessed: false,
    }

    const { result } = handleStrReplace({
      ...params,
      previousToolCallFinished: Promise.resolve(),
      writeToClient: onResponseChunk,
      getLatestState: () => getFileProcessingValues(isolatedState),
      state: isolatedState,
    })

    const toolResult = await result

    if (toolResult) {
      const toolResultPart = createToolResultPart(toolCall, toolResult)

      toolResults.push(toolResultPart)
      onResponseChunk({
        type: 'tool_result',
        toolName: toolResultPart.toolName,
        toolCallId: toolCall.toolCallId,
        output: toolResult,
      })

      // Add to message history
      state.messages.push({
        role: 'tool' as const,
        content: toolResultPart,
      })

      // Track edited files for benchify
      trackEditedFile(toolCall, toolResult, editedFiles)
    }

    toolCalls.push(toolCall)
  } catch (error) {
    handleStrReplaceError({
      error,
      toolCall,
      operationIndex,
      totalOperations,
      toolResults,
      agentStepId,
      userInputId,
      onResponseChunk,
      logger,
    })
  }
}

/**
 * Creates a typed requestClientToolCall function for batch mode
 */
function createRequestClientToolCall(params: {
  requestToolCall: RequestToolCallFn
  userInputId: string
}) {
  const { requestToolCall, userInputId } = params
  return async (
    clientToolCall: any,
  ): Promise<CodebuffToolOutput<'str_replace'>> => {
    const result = await requestToolCall({
      userInputId,
      toolName: clientToolCall.toolName,
      input: clientToolCall.input,
    })
    return result.output as CodebuffToolOutput<'str_replace'>
  }
}

/**
 * Creates a properly typed tool result part
 */
function createToolResultPart(
  toolCall: CodebuffToolCall<'str_replace'>,
  toolResult: CodebuffToolOutput<'str_replace'>,
): ToolResultPart {
  return {
    type: 'tool-result',
    toolName: 'str_replace',
    toolCallId: toolCall.toolCallId,
    output: toolResult,
  }
}

/**
 * Tracks successfully edited files for benchify processing
 */
function trackEditedFile(
  toolCall: CodebuffToolCall<'str_replace'>,
  toolResult: CodebuffToolOutput<'str_replace'>,
  editedFiles: Record<string, string>,
) {
  if (
    Array.isArray(toolResult) &&
    toolResult.length > 0 &&
    benchifyCanFixLanguage(toolCall.input.path)
  ) {
    const result = toolResult[0]
    if (result.type === 'json' && result.value && 'content' in result.value) {
      editedFiles[toolCall.input.path] = result.value.content as string
    }
  }
}

/**
 * Handles errors from str_replace operations with proper logging and error results
 */
function handleStrReplaceError(params: {
  error: unknown
  toolCall: CodebuffToolCall<'str_replace'>
  operationIndex: number
  totalOperations: number
  toolResults: ToolResultPart[]
  agentStepId: string
  userInputId: string
  onResponseChunk: (chunk: string | PrintModeEvent) => void
  logger: Logger
}) {
  const {
    error,
    toolCall,
    operationIndex,
    totalOperations,
    toolResults,
    agentStepId,
    userInputId,
    onResponseChunk,
    logger,
  } = params

  logger.error(
    {
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
      toolCallId: toolCall.toolCallId,
      path: toolCall.input.path,
      agentStepId,
      userInputId,
    },
    `Error executing batched str_replace ${operationIndex}/${totalOperations}`,
  )

  const errorResult: ToolResultPart = {
    type: 'tool-result',
    toolName: 'str_replace',
    toolCallId: toolCall.toolCallId,
    output: [
      {
        type: 'json',
        value: {
          errorMessage: `Batched str_replace failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      },
    ],
  }

  toolResults.push(errorResult)
  onResponseChunk({
    type: 'tool_result',
    toolName: errorResult.toolName || 'str_replace',
    toolCallId: toolCall.toolCallId,
    output: errorResult.output,
  })
}

/**
 * Applies benchify results if there are intended changes (with graceful failure handling)
 */
async function applyBenchifyIfNeeded(
  params: {
    agentStepId: string
    clientSessionId: string
    userInputId: string
    userId: string | undefined
    toolResults: ToolResultPart[]
    toolCalls: CodebuffToolCall<'str_replace'>[]
    logger: Logger
  } & BatchContext &
    ParamsExcluding<typeof callBenchifyWithResilience, 'editedFiles'> &
    ParamsExcluding<
      typeof applyBenchifyResultsGracefully,
      'editedFiles' | 'benchifyDiff' | 'state'
    > &
    ParamsExcluding<
      typeof handleBenchifyFailure,
      'error' | 'intendedChangeFiles'
    >,
) {
  const {
    intendedChanges,
    state,
    originalContents,
    agentStepId,
    userInputId,
    logger,
  } = params
  // Early exit conditions - fail gracefully without blocking user edits
  if (Object.keys(intendedChanges).length === 0) {
    return
  }

  // Check circuit breaker
  if (isBenchifyCircuitOpen({ logger })) {
    return
  }

  try {
    // Filter and validate intended changes for Benchify
    const filteredChanges = filterBenchifyFiles({
      files: Object.entries(intendedChanges).map(([path, contents]) => ({
        path,
        contents,
      })),
      agentStepId,
      logger,
    })

    if (filteredChanges.length === 0) {
      return
    }

    // Call Benchify with timeout and retry logic
    const benchifyResult = await callBenchifyWithResilience({
      ...params,
      editedFiles: filteredChanges,
    })

    if (benchifyResult && benchifyResult.length > 0) {
      // Apply results with individual error handling to prevent one failure from blocking others
      await applyBenchifyResultsGracefully({
        ...params,
        editedFiles: filteredChanges,
        benchifyDiff: benchifyResult,
        state: {
          ...state,
          originalContents,
        },
      })
    }

    // Reset circuit breaker on success
    resetBenchifyCircuitBreaker({ logger })
  } catch (error) {
    // Handle Benchify failure gracefully without blocking user edits
    handleBenchifyFailure({
      ...params,
      error,
      intendedChangeFiles: Object.keys(intendedChanges),
    })
  }
}

/**
 * Filters files for Benchify processing based on size and count limits
 */
function filterBenchifyFiles(params: {
  files: { path: string; contents: string }[]
  agentStepId: string
  logger: Logger
}): { path: string; contents: string }[] {
  const { files, agentStepId, logger } = params
  const filtered = files.filter((file) => {
    // Check file size limit
    if (file.contents.length > BENCHIFY_MAX_FILE_SIZE) {
      logger.debug(
        { path: file.path, size: file.contents.length, agentStepId },
        'Skipping large file for Benchify',
      )
      return false
    }

    // Check if it's a supported file type
    if (!benchifyCanFixLanguage(file.path)) {
      return false
    }

    return true
  })

  // Limit the number of files sent to Benchify
  if (filtered.length > BENCHIFY_MAX_FILES) {
    logger.debug(
      {
        totalFiles: filtered.length,
        maxFiles: BENCHIFY_MAX_FILES,
        agentStepId,
      },
      'Limiting files sent to Benchify',
    )
    return filtered.slice(0, BENCHIFY_MAX_FILES)
  }

  return filtered
}

/**
 * Calls benchify API with timeout and retry logic using common utilities
 */
async function callBenchifyWithResilience(params: {
  editedFiles: { path: string; contents: string }[]
  agentStepId: string
  clientSessionId: string
  userInputId: string
  userId: string | undefined
  logger: Logger
}): Promise<string | null> {
  const {
    editedFiles,
    agentStepId,
    clientSessionId,
    userInputId,
    userId,
    logger,
  } = params
  const client = getBenchifyClient({ logger })
  if (!client) {
    return null
  }

  return await withRetry(
    async () => {
      logger.info(
        {
          fileCount: editedFiles.length,
          filePaths: editedFiles.map((f) => f.path),
          agentStepId: agentStepId,
          userInputId: userInputId,
        },
        'Calling Benchify API',
      )

      const diff_response = await withTimeout(
        client.runFixer(editedFiles, {
          fixes: ['parsing'],
          mode: 'files',
          response_format: 'DIFF',
        }),
        BENCHIFY_TIMEOUT_MS,
        `Benchify call timed out after ${BENCHIFY_TIMEOUT_MS}ms`,
      )
      if (diff_response) {
        return diff_response
      }

      return null
    },
    {
      maxRetries: 2,
      retryIf: shouldRetryBenchifyError,
      onRetry: (error, attempt) => {
        logger.debug(
          {
            error: error instanceof Error ? error.message : String(error),
            attempt,
            agentStepId,
          },
          'Retrying Benchify call',
        )
      },
      retryDelayMs: 100,
    },
  )
}

/**
 * Determines if a Benchify error should trigger a retry
 */
function shouldRetryBenchifyError(error: Error): boolean {
  const message = error.message.toLowerCase()

  // Retry on network/timeout errors
  if (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('econnreset')
  ) {
    return true
  }

  // Retry on 5xx server errors (but not 4xx client errors)
  if (
    message.includes('5') &&
    (message.includes('error') || message.includes('server'))
  ) {
    return true
  }

  // Don't retry on authentication, rate limit, or client errors
  return false
}

/**
 * Applies benchify results back to the file system with individual error handling
 */
async function applyBenchifyResultsGracefully(
  params: {
    editedFiles: { path: string; contents: string }[]
    benchifyDiff: string
    agentStepId: string
    logger: Logger
  } & ParamsExcluding<
    typeof applyBenchifyResultSafely,
    'benchifyFile' | 'benchifyDiff'
  >,
) {
  const { editedFiles, benchifyDiff, agentStepId, logger } = params
  const results = await Promise.allSettled(
    editedFiles.map((editedFile) => {
      if (benchifyDiff) {
        applyBenchifyResultSafely({
          ...params,
          benchifyFile: editedFile,
          benchifyDiff,
        })
      } else {
        logger.warn(
          { file: editedFile.path },
          'No Benchify diff found for file.',
        )
      }
    }),
  )

  // Log any failures but don't throw - individual file failures shouldn't block the batch
  const failures = results.filter((result) => result.status === 'rejected')
  if (failures.length > 0) {
    logger.warn(
      {
        failureCount: failures.length,
        totalFiles: editedFiles.length,
        agentStepId,
      },
      'Some Benchify results failed to apply',
    )
  }
}

/**
 * Safely applies a single Benchify result with comprehensive error handling
 */
async function applyBenchifyResultSafely(params: {
  benchifyFile: { path: string; contents: string }
  benchifyDiff: string
  onResponseChunk: (chunk: string | PrintModeEvent) => void
  state: Record<string, any>
  toolResults: ToolResultPart[]
  toolCalls: CodebuffToolCall<'str_replace'>[]
  userInputId: string
  agentStepId: string
  requestToolCall: RequestToolCallFn
  logger: Logger
}): Promise<void> {
  const {
    benchifyFile,
    benchifyDiff,
    onResponseChunk,
    requestToolCall,
    logger,
    toolCalls,
    agentStepId,
    userInputId,
    state,
    toolResults,
  } = params
  try {
    // Find the corresponding tool call for this file
    const relatedToolCall = toolCalls.find(
      (tc) => tc.input.path === benchifyFile.path,
    )

    if (!relatedToolCall) {
      logger.debug(
        { fileName: benchifyFile.path, agentStepId: agentStepId },
        'No matching tool call found for benchify result',
      )
      return
    }

    // Get the original content, preferring the latest applied content if available
    let baseContent = state.originalContents?.[benchifyFile.path]

    // Try to get more recent content from tool results if available
    const latestToolResult = toolResults
      .filter(
        (tr) =>
          tr.toolName === 'str_replace' &&
          tr.toolCallId === relatedToolCall.toolCallId,
      )
      .pop()

    if (latestToolResult?.output?.[0]?.type === 'json') {
      const toolValue = latestToolResult.output[0].value
      if (
        toolValue &&
        typeof toolValue === 'object' &&
        'content' in toolValue
      ) {
        baseContent = (toolValue as { content: string }).content
      }
    }

    if (!baseContent) {
      logger.debug(
        { path: benchifyFile.path, agentStepId },
        'Could not find base content for Benchify diff generation',
      )
      return
    }

    // Apply with timeout to prevent hanging
    const toolCallResult = await withTimeout(
      requestToolCall({
        userInputId,
        toolName: 'str_replace',
        input: {
          type: 'patch',
          path: benchifyFile.path,
          content: benchifyDiff,
        },
      }),
      5000,
      'Benchify patch application timed out',
    )

    // Create a tool result indicating benchify was applied
    const benchifyToolResult: ToolResultPart = {
      type: 'tool-result',
      toolName: 'str_replace',
      toolCallId: relatedToolCall.toolCallId,
      output: toolCallResult.output,
    }

    // Update the existing tool result
    const existingResultIndex = toolResults.findIndex(
      (tr) => tr.toolCallId === relatedToolCall.toolCallId,
    )

    if (existingResultIndex >= 0) {
      toolResults[existingResultIndex] = benchifyToolResult
    } else {
      toolResults.push(benchifyToolResult)
    }

    // Notify client about the benchify update
    onResponseChunk({
      type: 'tool_result',
      toolName: benchifyToolResult.toolName || 'str_replace',
      toolCallId: relatedToolCall.toolCallId,
      output: benchifyToolResult.output,
    })

    logger.debug(
      { path: benchifyFile.path, agentStepId },
      'Successfully applied Benchify result',
    )
  } catch (error) {
    // Log but don't throw - individual failures shouldn't block the entire batch
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        fileName: benchifyFile.path,
        agentStepId,
      },
      'Failed to apply individual Benchify result',
    )
  }
}

/**
 * Extracts the intended file content by applying str_replace operations to the current content
 */
async function extractIntendedContent(params: {
  toolCall: CodebuffToolCall<'str_replace'>
  currentContent: string
  logger: Logger
}): Promise<string | null> {
  const { toolCall, currentContent, logger } = params
  try {
    let content = currentContent

    // Apply all replacements to get the intended content
    for (const replacement of toolCall.input.replacements) {
      const { old, new: newStr, allowMultiple } = replacement

      if (allowMultiple) {
        content = content.replaceAll(old, newStr)
      } else {
        // Find the first occurrence and replace it
        const index = content.indexOf(old)
        if (index !== -1) {
          content =
            content.substring(0, index) +
            newStr +
            content.substring(index + old.length)
        } else {
          // Log warning but continue - this might be expected if operations are interdependent
          logger.debug(
            {
              old: old.substring(0, 100), // Truncate for logging
              new: newStr.substring(0, 100),
              path: toolCall.input.path,
            },
            'String not found in content during intended content extraction',
          )
        }
      }
    }

    return content
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        path: toolCall.input.path,
      },
      'Failed to apply replacements for intended content extraction',
    )
    return null
  }
}

/**
 * Circuit breaker functions for Benchify resilience
 */
function isBenchifyCircuitOpen(params: { logger: Logger }): boolean {
  const { logger } = params
  const now = Date.now()

  // Check if circuit should be half-open (reset after timeout)
  if (benchifyCircuitBreaker.isOpen && now > benchifyCircuitBreaker.openUntil) {
    benchifyCircuitBreaker.isOpen = false
    benchifyCircuitBreaker.failureCount = 0
    logger.debug('Benchify circuit breaker reset to closed state')
  }

  return benchifyCircuitBreaker.isOpen
}

function handleBenchifyFailure(params: {
  error: unknown
  intendedChangeFiles: string[]
  agentStepId: string
  userInputId: string
  logger: Logger
}): void {
  const { error, intendedChangeFiles, agentStepId, userInputId, logger } =
    params
  benchifyCircuitBreaker.failureCount++
  benchifyCircuitBreaker.lastFailureTime = Date.now()

  // Open circuit if failure threshold exceeded
  if (benchifyCircuitBreaker.failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
    benchifyCircuitBreaker.isOpen = true
    benchifyCircuitBreaker.openUntil = Date.now() + CIRCUIT_BREAKER_TIMEOUT

    logger.warn(
      {
        failureCount: benchifyCircuitBreaker.failureCount,
        circuitOpenUntil: new Date(
          benchifyCircuitBreaker.openUntil,
        ).toISOString(),
        agentStepId,
      },
      'Benchify circuit breaker opened due to consecutive failures',
    )
  }

  // Log error but continue gracefully
  logger.warn(
    {
      error: error instanceof Error ? error.message : String(error),
      failureCount: benchifyCircuitBreaker.failureCount,
      intendedChangeFiles,
      agentStepId,
      userInputId,
    },
    'Benchify call failed, continuing without fixes',
  )
}

function resetBenchifyCircuitBreaker(params: { logger: Logger }): void {
  const { logger } = params
  if (benchifyCircuitBreaker.failureCount > 0) {
    logger.debug(
      { previousFailures: benchifyCircuitBreaker.failureCount },
      'Benchify circuit breaker reset after successful call',
    )
  }

  benchifyCircuitBreaker.failureCount = 0
  benchifyCircuitBreaker.isOpen = false
  benchifyCircuitBreaker.openUntil = 0
}

export function benchifyCanFixLanguage(path: string): boolean {
  return BENCHIFY_FILE_TYPES.some((extension) => path.endsWith(`.${extension}`))
}
