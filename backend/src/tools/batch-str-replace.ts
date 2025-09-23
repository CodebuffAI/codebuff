import { handleStrReplace } from './handlers/tool/str-replace'
import { getFileProcessingValues } from './handlers/tool/write-file'
import { logger } from '../util/logger'
import { Benchify } from 'benchify'
import { env } from '@codebuff/internal/env'
import { requestToolCall } from '../websockets/websocket-action'
import { createPatch } from 'diff'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
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
      // Log available environment variables (partial for debugging)
      const envKeys = Object.keys(process.env)
        .filter((key) => key.includes('BENCHIFY') || key.includes('API'))
        .slice(0, 10) // Limit to first 10 for safety

      benchifyApiKey = env.BENCHIFY_API_KEY
      logger.info(
        {
          hasApiKey: !!benchifyApiKey,
          apiKeyLength: benchifyApiKey?.length || 0,
          apiKeyPrefix: benchifyApiKey?.substring(0, 8) || 'none',
          availableEnvKeys: envKeys,
          nodeEnv: process.env.NODE_ENV,
        },
        'getBenchifyClient: Attempting to access BENCHIFY_API_KEY from environment',
      )
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          nodeEnv: process.env.NODE_ENV,
        },
        'getBenchifyClient: Failed to access BENCHIFY_API_KEY from environment',
      )
      return null
    }

    if (!benchifyApiKey) {
      logger.warn(
        'getBenchifyClient: No BENCHIFY_API_KEY found, returning null',
      )
      return null
    }

    try {
      benchifyClient = new Benchify({
        apiKey: benchifyApiKey,
      })
      logger.info('getBenchifyClient: Successfully created Benchify client')
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'getBenchifyClient: Failed to create Benchify client',
      )
      return null
    }
  }
  return benchifyClient
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
  logger.info(
    {
      deferredCount: deferredStrReplaces.length,
      agentStepId,
      userInputId,
      userId,
    },
    'executeBatchStrReplaces: Starting batch execution',
  )

  if (deferredStrReplaces.length === 0) {
    logger.info(
      'executeBatchStrReplaces: No deferred str_replace operations, returning early',
    )
    return
  }

  const batchPromises: Promise<void>[] = []
  let previousPromise = Promise.resolve()

  // Track successfully edited files for benchify call
  const editedFiles: { path: string; contents: string }[] = []
  // Track intended changes from LLM for benchify call (even if str_replace fails)
  const intendedChanges: { path: string; contents: string }[] = []
  // Track original file contents before any modifications
  const originalContents: Record<string, string> = {}

  // Execute all str_replace calls in sequence to maintain file consistency
  for (let i = 0; i < deferredStrReplaces.length; i++) {
    const { toolCall } = deferredStrReplaces[i]

    // Read original content before any modifications (only once per file)
    const isFileEligibleForBenchify = benchifyCanFixLanguage(
      toolCall.input.path,
    )

    if (!isFileEligibleForBenchify) {
      logger.debug(
        {
          path: toolCall.input.path,
          supportedExtensions: BENCHIFY_FILE_TYPES,
          agentStepId,
          userInputId,
        },
        'executeBatchStrReplaces: File not eligible for benchify (unsupported file type)',
      )
    }

    if (isFileEligibleForBenchify && !originalContents[toolCall.input.path]) {
      try {
        const originalContent = await extractOriginalContent(
          toolCall.input.path,
          fileContext,
        )
        if (originalContent) {
          originalContents[toolCall.input.path] = originalContent
        }
      } catch (error) {
        logger.warn(
          {
            error: error instanceof Error ? error.message : String(error),
            path: toolCall.input.path,
          },
          'Failed to read original content for benchify',
        )
      }
    }

    // Extract intended content from str_replace operation before attempting execution
    if (
      benchifyCanFixLanguage(toolCall.input.path) &&
      originalContents[toolCall.input.path]
    ) {
      try {
        const intendedContent = await extractIntendedContent(
          toolCall,
          originalContents[toolCall.input.path],
        )
        if (intendedContent) {
          const existingIndex = intendedChanges.findIndex(
            (f) => f.path === toolCall.input.path,
          )
          if (existingIndex >= 0) {
            intendedChanges[existingIndex].contents = intendedContent
          } else {
            intendedChanges.push({
              path: toolCall.input.path,
              contents: intendedContent,
            })
          }
          logger.debug(
            {
              path: toolCall.input.path,
              intendedContentLength: intendedContent.length,
              agentStepId,
              userInputId,
            },
            'executeBatchStrReplaces: Successfully extracted intended content for benchify',
          )
        }
      } catch (error) {
        logger.warn(
          {
            error: error instanceof Error ? error.message : String(error),
            path: toolCall.input.path,
          },
          'executeBatchStrReplaces: Failed to extract intended content for benchify',
        )
      }
    } else {
      logger.debug(
        {
          path: toolCall.input.path,
          canFixLanguage: benchifyCanFixLanguage(toolCall.input.path),
          hasOriginalContent: !!originalContents[toolCall.input.path],
          agentStepId,
          userInputId,
        },
        'executeBatchStrReplaces: Skipping intended content extraction (not benchify-compatible file or no original content)',
      )
    }

    // Chain each str_replace to the previous one to ensure proper ordering
    const strReplacePromise = previousPromise.then(async () => {
      try {
        const { result } = handleStrReplace({
          previousToolCallFinished: Promise.resolve(),
          toolCall,
          requestClientToolCall: async () => {
            throw new Error('Client tool calls not supported in batch mode')
          },
          writeToClient: onResponseChunk,
          getLatestState: () => getFileProcessingValues(state),
          state: { ...state, ws },
        })

        const toolResult = await result

        if (toolResult) {
          const toolResultPart: ToolResultPart = {
            type: 'tool-result',
            toolName: 'str_replace',
            toolCallId: toolCall.toolCallId,
            output: toolResult,
          }

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

          // Track successfully edited files
          if (
            Array.isArray(toolResult) &&
            toolResult.length > 0 &&
            benchifyCanFixLanguage(toolCall.input.path)
          ) {
            const result = toolResult[0]
            if (
              result.type === 'json' &&
              result.value &&
              'content' in result.value
            ) {
              const existingFileIndex = editedFiles.findIndex(
                (f) => f.path === toolCall.input.path,
              )
              const fileContent = result.value.content as string

              if (existingFileIndex >= 0) {
                // Update existing file with latest content
                editedFiles[existingFileIndex].contents = fileContent
              } else {
                // Add new file to tracking
                editedFiles.push({
                  path: toolCall.input.path,
                  contents: fileContent,
                })
              }
            }
          }
        }
      } catch (error) {
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
            toolCallInput: JSON.stringify(toolCall.input, null, 2),
            agentStepId,
            userInputId,
          },
          `Error executing batched str_replace ${i + 1}/${deferredStrReplaces.length}`,
        )

        // Create error result
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

        // Add to message history even for errors
        state.messages.push({
          role: 'tool' as const,
          content: errorResult,
        })

        logger.info(
          {
            toolCallId: toolCall.toolCallId,
            path: toolCall.input.path,
            errorMessage:
              error instanceof Error ? error.message : String(error),
            agentStepId,
            userInputId,
          },
          'executeBatchStrReplaces: str_replace failed, but continuing with batch execution for benchify',
        )
      }
    })

    // Add to toolCalls array
    toolCalls.push(toolCall)
    batchPromises.push(strReplacePromise)
    previousPromise = strReplacePromise
  }

  // Wait for all batched operations to complete
  await Promise.all(batchPromises)

  logger.info(
    {
      totalOperations: deferredStrReplaces.length,
      successfulEdits: editedFiles.length,
      intendedChangesCount: intendedChanges.length,
      benchifyEligibleFiles: deferredStrReplaces.filter((d) =>
        benchifyCanFixLanguage(d.toolCall.input.path),
      ).length,
      agentStepId,
      userInputId,
    },
    'executeBatchStrReplaces: Batch operations completed, summary before benchify call',
  )

  // Call benchify with intended changes (even if str_replace operations failed)
  logger.info(
    {
      intendedChangesCount: intendedChanges.length,
      editedFilesCount: editedFiles.length,
      intendedChangeFiles: intendedChanges.map((f) => f.path),
      editedFilesList: editedFiles.map((f) => f.path),
      agentStepId,
      userInputId,
    },
    'executeBatchStrReplaces: Preparing to call benchify',
  )

  const client = getBenchifyClient()
  if (!client) {
    logger.warn(
      'executeBatchStrReplaces: No benchify client available, skipping benchify call',
    )
    return
  }

  if (intendedChanges.length === 0) {
    logger.warn(
      'executeBatchStrReplaces: No intended changes for benchify, skipping benchify call',
    )
    return
  }

  try {
    const benchifyResult = await callBenchify(intendedChanges, {
      agentStepId,
      clientSessionId,
      userInputId,
      userId,
    })

    if (benchifyResult && benchifyResult.length > 0) {
      logger.info(
        {
          benchifyResultCount: benchifyResult.length,
          resultFiles: benchifyResult.map((r) => r.path),
          agentStepId,
          userInputId,
        },
        `executeBatchStrReplaces: Benchify returned ${benchifyResult.length} results, applying them`,
      )

      // Apply benchify results back to files
      await applyBenchifyResults(benchifyResult, {
        ws,
        onResponseChunk,
        state: { ...state, originalContents },
        toolResults,
        toolCalls: deferredStrReplaces.map((d) => d.toolCall),
        userInputId,
      })
    }
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        intendedChangeFiles: intendedChanges.map((f) => f.path),
        agentStepId,
        userInputId,
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
  logger.info(
    {
      editedFilesCount: editedFiles.length,
      editedFilesList: editedFiles.map((f) => f.path),
      totalContentLength: editedFiles.reduce(
        (sum, f) => sum + f.contents.length,
        0,
      ),
      ...context,
    },
    'callBenchify: Starting benchify API call',
  )

  const client = getBenchifyClient()
  if (!client) {
    logger.error('callBenchify: No benchify client available')
    return null
  }

  try {
    logger.info(
      {
        fixTypes: ['string_literals'],
        ...context,
      },
      'callBenchify: Calling client.runFixer',
    )

    const response = await client.runFixer(editedFiles, {
      fix_types: ['string_literals'],
    })

    logger.info(
      {
        responseReceived: !!response,
        responseLength: response?.length || 0,
        responseFiles: response?.map((r) => r.path) || [],
        responseContentLengths: response?.map((r) => r.contents.length) || [],
        ...context,
      },
      'callBenchify: Benchify runFixer API response received successfully',
    )

    return response
  } catch (error) {
    logger.error(
      {
        error:
          error instanceof Error
            ? {
                message: error.message,
                stack: error.stack,
                name: error.name,
              }
            : String(error),
        editedFilesCount: editedFiles.length,
        ...context,
      },
      'callBenchify: Failed to call benchify API',
    )
    throw error
  }
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
  logger.info(
    {
      benchifyFilesCount: benchifyFiles.length,
      benchifyFilesList: benchifyFiles.map((f) => f.path),
      toolCallsCount: context.toolCalls.length,
      userInputId: context.userInputId,
    },
    'applyBenchifyResults: Starting to apply benchify results',
  )

  for (const benchifyFile of benchifyFiles) {
    logger.debug(
      {
        fileName: benchifyFile.path,
        contentLength: benchifyFile.contents.length,
        userInputId: context.userInputId,
      },
      'applyBenchifyResults: Processing benchify file',
    )
    try {
      // Find the corresponding tool call for this file
      const relatedToolCall = context.toolCalls.find(
        (tc) => tc.input.path === benchifyFile.path,
      )

      if (!relatedToolCall) {
        logger.warn(
          {
            fileName: benchifyFile.path,
            availableToolCallPaths: context.toolCalls.map(
              (tc) => tc.input.path,
            ),
            userInputId: context.userInputId,
          },
          'applyBenchifyResults: No matching tool call found for benchify result',
        )
        continue
      }

      logger.debug(
        {
          fileName: benchifyFile.path,
          relatedToolCallId: relatedToolCall.toolCallId,
          userInputId: context.userInputId,
        },
        'applyBenchifyResults: Found matching tool call for benchify result',
      )

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
 * Extracts the intended file content by applying str_replace operations to the current file
 */
async function extractIntendedContent(
  toolCall: CodebuffToolCall<'str_replace'>,
  originalContent: string,
): Promise<string | null> {
  try {
    let currentContent = originalContent

    // Apply all replacements to get the intended content
    for (const replacement of toolCall.input.replacements) {
      const { old, new: newStr, allowMultiple } = replacement

      if (allowMultiple) {
        currentContent = currentContent.replaceAll(old, newStr)
      } else {
        // Find the first occurrence and replace it
        const index = currentContent.indexOf(old)
        if (index !== -1) {
          currentContent =
            currentContent.substring(0, index) +
            newStr +
            currentContent.substring(index + old.length)
          logger.debug(
            {
              old: old.substring(0, 100) + (old.length > 100 ? '...' : ''),
              new:
                newStr.substring(0, 100) + (newStr.length > 100 ? '...' : ''),
              path: toolCall.input.path,
            },
            'extractIntendedContent: Successfully applied replacement for benchify',
          )
        } else {
          // If we can't find the old string, log it but continue with other replacements
          logger.warn(
            {
              old: old.substring(0, 200) + (old.length > 200 ? '...' : ''),
              new:
                newStr.substring(0, 100) + (newStr.length > 100 ? '...' : ''),
              allowMultiple,
              path: toolCall.input.path,
              contentLength: currentContent.length,
            },
            'extractIntendedContent: Failed to find old string in currentContent for benchify',
          )
        }
      }
    }

    return currentContent
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
