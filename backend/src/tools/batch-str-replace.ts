import { handleStrReplace } from './handlers/tool/str-replace'
import { getFileProcessingValues } from './handlers/tool/write-file'
import { logger } from '../util/logger'
import { Benchify } from 'benchify'
import { env } from '@codebuff/internal/env'
import { requestToolCall, requestFiles } from '../websockets/websocket-action'
import { ParsedDiff, parsePatch } from 'diff'
import { withRetry, withTimeout } from '@codebuff/common/util/promise'
import { match, P } from 'ts-pattern'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { ToolResultPart } from '@codebuff/common/types/messages/content-part'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

import type { WebSocket } from 'ws'

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

export function getBenchifyClient(): Benchify | null {
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
  ws: WebSocket
  userInputId: string
  onResponseChunk: (chunk: string | PrintModeEvent) => void
  state: Record<string, any>
  originalContents: Record<string, string>
  editedFiles: Record<string, string>
  intendedChanges: Record<string, string>
}

export async function executeBatchStrReplaces({
  deferredStrReplaces,
  toolCalls,
  toolResults,
  ws,
  agentStepId,
  clientSessionId,
  userInputId,
  onResponseChunk,
  state,
  userId,
}: {
  deferredStrReplaces: DeferredStrReplace[]
  toolCalls: (CodebuffToolCall | any)[]
  toolResults: ToolResultPart[]
  ws: WebSocket
  agentStepId: string
  clientSessionId: string
  userInputId: string
  onResponseChunk: (chunk: string | PrintModeEvent) => void
  state: Record<string, any>
  userId: string | undefined
}) {
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
  const originalContents = await preloadOriginalContent(operationsByPath, ws)

  // Extract intended changes for benchify (before execution)
  const intendedChanges = await extractAllIntendedChanges(
    operationsByPath,
    originalContents,
  )

  // Track edited files during processing
  const editedFiles: Record<string, string> = {}

  // Create the requestClientToolCall function once for all operations
  const requestClientToolCall = createRequestClientToolCall({ ws, userInputId })

  // Execute operations grouped by path for better parallelization
  const pathPromises: Record<string, Promise<void>> = {}

  for (const [path, operations] of Object.entries(operationsByPath)) {
    pathPromises[path] = processPathOperations(operations, {
      toolCalls,
      toolResults,
      agentStepId,
      userInputId,
      onResponseChunk,
      state,
      editedFiles,
      requestClientToolCall,
    })
  }

  // Wait for all path-based operations to complete
  await Promise.all(Object.values(pathPromises))

  // Apply benchify if we have intended changes
  await applyBenchifyIfNeeded(
    {
      ws,
      userInputId,
      onResponseChunk,
      state,
      originalContents,
      editedFiles,
      intendedChanges,
    },
    {
      agentStepId,
      clientSessionId,
      userInputId,
      userId,
      toolResults,
      toolCalls: deferredStrReplaces.map((d) => d.toolCall),
    },
  )
  logger.debug({ agentStepId }, 'Completed batch processing')
}

/**
 * Pre-loads original file content for all paths that support benchify
 * Returns a record of path to content for files that were successfully loaded
 */
async function preloadOriginalContent(
  operationsByPath: Record<string, DeferredStrReplace[]>,
  ws: WebSocket,
): Promise<Record<string, string>> {
  const pathsToLoad = Object.keys(operationsByPath).filter(
    benchifyCanFixLanguage,
  )

  if (pathsToLoad.length === 0) {
    return {}
  }

  try {
    // Request all files from the client in one batch
    const fileContents = await requestFiles({ ws, filePaths: pathsToLoad })

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
async function extractAllIntendedChanges(
  operationsByPath: Record<string, DeferredStrReplace[]>,
  originalContents: Record<string, string>,
): Promise<Record<string, string>> {
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
          (await extractIntendedContent(toolCall, currentContent)) ||
          currentContent
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
  operations: DeferredStrReplace[],
  context: {
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
  },
) {
  let previousPromise = Promise.resolve()

  for (let i = 0; i < operations.length; i++) {
    const { toolCall } = operations[i]

    previousPromise = previousPromise.then(() =>
      executeSingleStrReplace(toolCall, i + 1, operations.length, context),
    )
  }

  await previousPromise
}

/**
 * Executes a single str_replace operation with proper error handling
 */
async function executeSingleStrReplace(
  toolCall: CodebuffToolCall<'str_replace'>,
  operationIndex: number,
  totalOperations: number,
  context: {
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
  },
) {
  const {
    userInputId,
    onResponseChunk,
    state,
    editedFiles,
    toolCalls,
    toolResults,
    agentStepId,
    requestClientToolCall,
  } = context

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
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      requestClientToolCall,
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
    handleStrReplaceError(error, toolCall, operationIndex, totalOperations, {
      toolResults,
      agentStepId,
      userInputId,
      onResponseChunk,
    })
  }
}

/**
 * Creates a typed requestClientToolCall function for batch mode
 */
function createRequestClientToolCall(params: {
  ws: WebSocket
  userInputId: string
}) {
  const { ws, userInputId } = params
  return async (
    clientToolCall: any,
  ): Promise<CodebuffToolOutput<'str_replace'>> => {
    const result = await requestToolCall(
      ws,
      userInputId,
      clientToolCall.toolName,
      clientToolCall.input,
    )
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
function handleStrReplaceError(
  error: unknown,
  toolCall: CodebuffToolCall<'str_replace'>,
  operationIndex: number,
  totalOperations: number,
  context: {
    toolResults: ToolResultPart[]
    agentStepId: string
    userInputId: string
    onResponseChunk: (chunk: string | PrintModeEvent) => void
  },
) {
  const { toolResults, agentStepId, userInputId, onResponseChunk } = context

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
    toolCallId: toolCall.toolCallId,
    output: errorResult.output,
  })
}

/**
 * Applies benchify results if there are intended changes (with graceful failure handling)
 */
async function applyBenchifyIfNeeded(
  batchContext: BatchContext,
  options: {
    agentStepId: string
    clientSessionId: string
    userInputId: string
    userId: string | undefined
    toolResults: ToolResultPart[]
    toolCalls: CodebuffToolCall<'str_replace'>[]
  },
) {
  // Early exit conditions - fail gracefully without blocking user edits
  if (Object.keys(batchContext.intendedChanges).length === 0) {
    return
  }

  // Check circuit breaker
  if (isBenchifyCircuitOpen()) {
    return
  }

  try {
    // Filter and validate intended changes for Benchify
    const filteredChanges = filterBenchifyFiles(
      Object.entries(batchContext.intendedChanges).map(([path, contents]) => ({
        path,
        contents,
      })),
      options.agentStepId,
    )

    if (filteredChanges.length === 0) {
      return
    }

    // Call Benchify with timeout and retry logic
    const benchifyResult = await callBenchifyWithResilience(
      filteredChanges,
      options,
    )

    if (benchifyResult && benchifyResult.length > 0) {
      // Apply results with individual error handling to prevent one failure from blocking others
      await applyBenchifyResultsGracefully(filteredChanges, benchifyResult, {
        ws: batchContext.ws,
        onResponseChunk: batchContext.onResponseChunk,
        state: {
          ...batchContext.state,
          originalContents: batchContext.originalContents,
        },
        toolResults: options.toolResults,
        toolCalls: options.toolCalls,
        userInputId: options.userInputId,
        agentStepId: options.agentStepId,
      })
    }

    // Reset circuit breaker on success
    resetBenchifyCircuitBreaker()
  } catch (error) {
    // Handle Benchify failure gracefully without blocking user edits
    handleBenchifyFailure(error, {
      intendedChangeFiles: Object.keys(batchContext.intendedChanges),
      agentStepId: options.agentStepId,
      userInputId: options.userInputId,
    })
  }
}

/**
 * Filters files for Benchify processing based on size and count limits
 */
function filterBenchifyFiles(
  files: { path: string; contents: string }[],
  agentStepId: string,
): { path: string; contents: string }[] {
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
async function callBenchifyWithResilience(
  editedFiles: { path: string; contents: string }[],
  context: {
    agentStepId: string
    clientSessionId: string
    userInputId: string
    userId: string | undefined
  },
): Promise<string | null> {
  const client = getBenchifyClient()
  if (!client) {
    return null
  }

  return await withRetry(
    async () => {
      logger.info(
        {
          fileCount: editedFiles.length,
          filePaths: editedFiles.map((f) => f.path),
          agentStepId: context.agentStepId,
          userInputId: context.userInputId,
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
            agentStepId: context.agentStepId,
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
  editedFiles: { path: string; contents: string }[],
  benchifyDiff: string,
  context: {
    ws: WebSocket
    onResponseChunk: (chunk: string | PrintModeEvent) => void
    state: Record<string, any>
    toolResults: ToolResultPart[]
    toolCalls: CodebuffToolCall<'str_replace'>[]
    userInputId: string
    agentStepId: string
  },
) {
  const results = await Promise.allSettled(
    editedFiles.map((editedFile) => {
      if (benchifyDiff) {
        applyBenchifyResultSafely(editedFile, benchifyDiff, context)
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
        agentStepId: context.agentStepId,
      },
      'Some Benchify results failed to apply',
    )
  }
}

/**
 * Safely applies a single Benchify result with comprehensive error handling
 */
async function applyBenchifyResultSafely(
  benchifyFile: { path: string; contents: string },
  benchifyDiff: string,
  context: {
    ws: WebSocket
    onResponseChunk: (chunk: string | PrintModeEvent) => void
    state: Record<string, any>
    toolResults: ToolResultPart[]
    toolCalls: CodebuffToolCall<'str_replace'>[]
    userInputId: string
    agentStepId: string
  },
): Promise<void> {
  try {
    // Find the corresponding tool call for this file
    const relatedToolCall = context.toolCalls.find(
      (tc) => tc.input.path === benchifyFile.path,
    )

    if (!relatedToolCall) {
      logger.debug(
        { fileName: benchifyFile.path, agentStepId: context.agentStepId },
        'No matching tool call found for benchify result',
      )
      return
    }

    // Get the original content, preferring the latest applied content if available
    let baseContent = context.state.originalContents?.[benchifyFile.path]

    // Try to get more recent content from tool results if available
    const latestToolResult = context.toolResults
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
        { path: benchifyFile.path, agentStepId: context.agentStepId },
        'Could not find base content for Benchify diff generation',
      )
      return
    }

    // Apply with timeout to prevent hanging
    const toolCallResult = await withTimeout(
      requestToolCall(context.ws, context.userInputId, 'str_replace', {
        type: 'patch',
        path: benchifyFile.path,
        content: benchifyDiff,
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
    const existingResultIndex = context.toolResults.findIndex(
      (tr) => tr.toolCallId === relatedToolCall.toolCallId,
    )

    if (existingResultIndex >= 0) {
      context.toolResults[existingResultIndex] = benchifyToolResult
    } else {
      context.toolResults.push(benchifyToolResult)
    }

    // Notify client about the benchify update
    context.onResponseChunk({
      type: 'tool_result',
      toolCallId: relatedToolCall.toolCallId,
      output: benchifyToolResult.output,
    })

    logger.debug(
      { path: benchifyFile.path, agentStepId: context.agentStepId },
      'Successfully applied Benchify result',
    )
  } catch (error) {
    // Log but don't throw - individual failures shouldn't block the entire batch
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        fileName: benchifyFile.path,
        agentStepId: context.agentStepId,
      },
      'Failed to apply individual Benchify result',
    )
  }
}

/**
 * Extracts the intended file content by applying str_replace operations to the current content
 */
async function extractIntendedContent(
  toolCall: CodebuffToolCall<'str_replace'>,
  currentContent: string,
): Promise<string | null> {
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
function isBenchifyCircuitOpen(): boolean {
  const now = Date.now()

  // Check if circuit should be half-open (reset after timeout)
  if (benchifyCircuitBreaker.isOpen && now > benchifyCircuitBreaker.openUntil) {
    benchifyCircuitBreaker.isOpen = false
    benchifyCircuitBreaker.failureCount = 0
    logger.debug('Benchify circuit breaker reset to closed state')
  }

  return benchifyCircuitBreaker.isOpen
}

function handleBenchifyFailure(
  error: unknown,
  context: {
    intendedChangeFiles: string[]
    agentStepId: string
    userInputId: string
  },
): void {
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
        agentStepId: context.agentStepId,
      },
      'Benchify circuit breaker opened due to consecutive failures',
    )
  }

  // Log error but continue gracefully
  logger.warn(
    {
      error: error instanceof Error ? error.message : String(error),
      failureCount: benchifyCircuitBreaker.failureCount,
      intendedChangeFiles: context.intendedChangeFiles,
      agentStepId: context.agentStepId,
      userInputId: context.userInputId,
    },
    'Benchify call failed, continuing without fixes',
  )
}

function resetBenchifyCircuitBreaker(): void {
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
