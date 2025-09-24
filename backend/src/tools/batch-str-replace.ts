import { handleStrReplace } from './handlers/tool/str-replace'
import { getFileProcessingValues } from './handlers/tool/write-file'
import { logger } from '../util/logger'
import { Benchify } from 'benchify'
import { env } from '@codebuff/internal/env'
import { requestToolCall } from '../websockets/websocket-action'
import { createPatch } from 'diff'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { ToolResultPart } from '@codebuff/common/types/messages/content-part'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { AgentTemplate } from '../templates/types'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { WebSocket } from 'ws'
import { file } from 'bun'

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

// Global Benchify client instance
let benchifyClient: Benchify | null = null

function getBenchifyClient(): Benchify | null {
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
  editedFiles: Map<string, string>
  intendedChanges: Map<string, string>
}

export async function executeBatchStrReplaces({
  deferredStrReplaces,
  toolCalls,
  toolResults,
  ws,
  agentTemplate,
  fileContext,
  agentStepId,
  clientSessionId,
  userInputId,
  fullResponse,
  onResponseChunk,
  state,
  userId,
}: {
  deferredStrReplaces: DeferredStrReplace[]
  toolCalls: (CodebuffToolCall | any)[]
  toolResults: ToolResultPart[]
  ws: WebSocket
  agentTemplate: AgentTemplate
  fileContext: ProjectFileContext
  agentStepId: string
  clientSessionId: string
  userInputId: string
  fullResponse: string
  onResponseChunk: (chunk: string | PrintModeEvent) => void
  state: Record<string, any>
  userId: string | undefined
}) {
  if (deferredStrReplaces.length === 0) {
    return
  }

  // Group operations by file path for per-path processing
  const operationsByPath = new Map<string, DeferredStrReplace[]>()
  for (const operation of deferredStrReplaces) {
    const path = operation.toolCall.input.path
    if (!operationsByPath.has(path)) {
      operationsByPath.set(path, [])
    }
    operationsByPath.get(path)!.push(operation)
  }

  // Initialize batch context
  const batchContext: BatchContext = {
    ws,
    userInputId,
    onResponseChunk,
    state,
    originalContents: {},
    editedFiles: new Map(),
    intendedChanges: new Map(),
  }

  // Pre-load original content for all paths that support benchify
  await preloadOriginalContent(operationsByPath, fileContext, batchContext)

  // Extract intended changes for benchify (before execution)
  await extractAllIntendedChanges(operationsByPath, batchContext)

  // Execute operations grouped by path for better parallelization
  const pathPromises = new Map<string, Promise<void>>()

  for (const [path, operations] of operationsByPath) {
    pathPromises.set(
      path,
      processPathOperations(path, operations, {
        toolCalls,
        toolResults,
        agentStepId,
        batchContext,
      }),
    )
  }

  // Wait for all path-based operations to complete
  await Promise.all(pathPromises.values())

  // Apply benchify if we have intended changes
  await applyBenchifyIfNeeded(batchContext, {
    agentStepId,
    clientSessionId,
    userInputId,
    userId,
    toolResults,
    toolCalls: deferredStrReplaces.map((d) => d.toolCall),
  })
}

/**
 * Pre-loads original file content for all paths that support benchify
 */
async function preloadOriginalContent(
  operationsByPath: Map<string, DeferredStrReplace[]>,
  fileContext: ProjectFileContext,
  batchContext: BatchContext,
) {
  const pathsToLoad = Array.from(operationsByPath.keys()).filter(
    benchifyCanFixLanguage,
  )

  await Promise.all(
    pathsToLoad.map(async (path) => {
      try {
        const content = await extractOriginalContent(path, fileContext)
        if (content) {
          batchContext.originalContents[path] = content
        }
      } catch (error) {
        logger.warn(
          {
            error: error instanceof Error ? error.message : String(error),
            path,
          },
          'Failed to read original content for benchify',
        )
      }
    }),
  )
}

/**
 * Extracts intended changes for all operations (for benchify)
 */
async function extractAllIntendedChanges(
  operationsByPath: Map<string, DeferredStrReplace[]>,
  batchContext: BatchContext,
) {
  for (const [path, operations] of operationsByPath) {
    if (!benchifyCanFixLanguage(path) || !batchContext.originalContents[path]) {
      continue
    }

    try {
      let currentContent = batchContext.originalContents[path]

      // Apply all operations sequentially to get final intended content
      for (const { toolCall } of operations) {
        currentContent =
          (await extractIntendedContent(toolCall, currentContent)) ||
          currentContent
      }

      batchContext.intendedChanges.set(path, currentContent)
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error), path },
        'Failed to extract intended content for benchify',
      )
    }
  }
}

/**
 * Processes all operations for a single file path sequentially
 */
async function processPathOperations(
  path: string,
  operations: DeferredStrReplace[],
  context: {
    toolCalls: (CodebuffToolCall | any)[]
    toolResults: ToolResultPart[]
    agentStepId: string
    batchContext: BatchContext
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
    batchContext: BatchContext
  },
) {
  const { batchContext, toolCalls, toolResults, agentStepId } = context

  try {
    // Create isolated state for each operation
    const isolatedState = {
      ...batchContext.state,
      ws: batchContext.ws,
      promisesByPath: {},
      allPromises: [],
      fileChangeErrors: [],
      fileChanges: [],
      firstFileProcessed: false,
    }

    const { result } = handleStrReplace({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      requestClientToolCall: createRequestClientToolCall(batchContext),
      writeToClient: batchContext.onResponseChunk,
      getLatestState: () => getFileProcessingValues(isolatedState),
      state: isolatedState,
    })

    const toolResult = await result

    if (toolResult) {
      const toolResultPart = createToolResultPart(toolCall, toolResult)

      toolResults.push(toolResultPart)
      batchContext.onResponseChunk({
        type: 'tool_result',
        toolCallId: toolCall.toolCallId,
        output: toolResult,
      })

      // Add to message history
      batchContext.state.messages.push({
        role: 'tool' as const,
        content: toolResultPart,
      })

      // Track edited files for benchify
      trackEditedFile(toolCall, toolResult, batchContext)
    }

    toolCalls.push(toolCall)
  } catch (error) {
    handleStrReplaceError(error, toolCall, operationIndex, totalOperations, {
      toolResults,
      agentStepId,
      batchContext,
    })
  }
}

/**
 * Creates a typed requestClientToolCall function for batch mode
 */
function createRequestClientToolCall(batchContext: BatchContext) {
  return async (
    clientToolCall: any,
  ): Promise<CodebuffToolOutput<'str_replace'>> => {
    const result = await requestToolCall(
      batchContext.ws,
      batchContext.userInputId,
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
  batchContext: BatchContext,
) {
  if (
    Array.isArray(toolResult) &&
    toolResult.length > 0 &&
    benchifyCanFixLanguage(toolCall.input.path)
  ) {
    const result = toolResult[0]
    if (result.type === 'json' && result.value && 'content' in result.value) {
      batchContext.editedFiles.set(
        toolCall.input.path,
        result.value.content as string,
      )
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
    batchContext: BatchContext
  },
) {
  const { toolResults, agentStepId, batchContext } = context

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
      userInputId: batchContext.userInputId,
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
  batchContext.onResponseChunk({
    type: 'tool_result',
    toolCallId: toolCall.toolCallId,
    output: errorResult.output,
  })
}

/**
 * Applies benchify results if there are intended changes
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
  const client = getBenchifyClient()
  if (!client || batchContext.intendedChanges.size === 0) {
    return
  }

  try {
    const intendedChangesArray = Array.from(
      batchContext.intendedChanges.entries(),
    ).map(([path, contents]) => ({ path, contents }))

    const benchifyResult = await callBenchify(intendedChangesArray, options)

    if (benchifyResult && benchifyResult.length > 0) {
      logger.info(
        {
          benchifyResultCount: benchifyResult.length,
          resultFiles: benchifyResult.map((r) => r.path),
          agentStepId: options.agentStepId,
          userInputId: options.userInputId,
        },
        `executeBatchStrReplaces: Benchify returned ${benchifyResult.length} results, applying them`,
      )

      await applyBenchifyResults(benchifyResult, {
        ws: batchContext.ws,
        onResponseChunk: batchContext.onResponseChunk,
        state: {
          ...batchContext.state,
          originalContents: batchContext.originalContents,
        },
        toolResults: options.toolResults,
        toolCalls: options.toolCalls,
        userInputId: options.userInputId,
      })
    }
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        intendedChangeFiles: Array.from(batchContext.intendedChanges.keys()),
        agentStepId: options.agentStepId,
        userInputId: options.userInputId,
      },
      'executeBatchStrReplaces: Failed to call benchify with intended changes',
    )
  }
}

/**
 * Calls benchify API with the list of edited files
 */
async function callBenchify(
  editedFiles: { path: string; contents: string }[],
  context: {
    agentStepId: string
    clientSessionId: string
    userInputId: string
    userId: string | undefined
  },
): Promise<{ path: string; contents: string }[] | null> {
  const client = getBenchifyClient()
  if (!client) {
    return null
  }

  const response = await client.runFixer(editedFiles, {
    fix_types: ['string_literals'],
  })

  logger.info(
    {
      responseReceived: !!response,
      responseLength: response?.length || 0,
      responseFiles: response?.map((r) => r.path) || [],
      ...context,
    },
    'Benchify runFixer API response received',
  )

  return response
}

/**
 * Applies benchify results back to the file system and updates tool results
 */
async function applyBenchifyResults(
  benchifyFiles: { path: string; contents: string }[],
  context: {
    ws: WebSocket
    onResponseChunk: (chunk: string | PrintModeEvent) => void
    state: Record<string, any>
    toolResults: ToolResultPart[]
    toolCalls: CodebuffToolCall<'str_replace'>[]
    userInputId: string
  },
) {
  for (const benchifyFile of benchifyFiles) {
    try {
      // Find the corresponding tool call for this file
      const relatedToolCall = context.toolCalls.find(
        (tc) => tc.input.path === benchifyFile.path,
      )

      if (!relatedToolCall) {
        logger.warn(
          { fileName: benchifyFile.path },
          'No matching tool call found for benchify result',
        )
        continue
      }

      // Get the original file content from our stored contents
      const originalContent =
        context.state.originalContents?.[benchifyFile.path]

      if (!originalContent) {
        logger.error(
          { path: benchifyFile.path },
          'Could not find original file content for diff generation',
        )
        continue
      }

      // Generate a proper unified diff patch
      const patch = createPatch(
        benchifyFile.path,
        originalContent,
        benchifyFile.contents,
        '',
        '',
      )

      // Request the client to apply the benchify changes as a patch
      const toolCallResult = await requestToolCall(
        context.ws,
        context.userInputId,
        'str_replace',
        {
          type: 'patch',
          path: benchifyFile.path,
          content: patch,
        },
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
    } catch (error) {
      logger.error(
        { error, fileName: benchifyFile.path },
        'Failed to apply benchify result to file',
      )
    }
  }
}

/**
 * Extracts the original file content before any modifications
 */
async function extractOriginalContent(
  filePath: string,
  fileContext: ProjectFileContext,
): Promise<string | null> {
  try {
    const absolutePath = `${fileContext.projectRoot}/${filePath}`
    const currentFile = await file(absolutePath)
    return await currentFile.text()
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        path: filePath,
      },
      'Failed to read original file content',
    )
    return null
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

function benchifyCanFixLanguage(path: string): boolean {
  return BENCHIFY_FILE_TYPES.some((extension) => path.endsWith(`.${extension}`))
}
