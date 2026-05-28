import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'

import { jsonToolResult } from '@codebuff/common/util/messages'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const execFileAsync = promisify(execFile)

const WEBSEARCH_TIMEOUT_MS = 30_000

/**
 * Resolve the open-websearch binary from node_modules.
 * This avoids requiring a global install — it's resolved from the
 * @codebuff/agent-runtime package's own dependency tree.
 */
const resolveOpenWebsearchBin = (logger?: Logger): string | null => {
  try {
    const require = createRequire(import.meta.url)
    return require.resolve('open-websearch/build/index.js')
  } catch (err) {
    logger?.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'Failed to resolve open-websearch binary',
    )
    return null
  }
}

export const handleWebSearch = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'web_search'>
  logger: Logger

  agentStepId: string
  clientSessionId: string
  fingerprintId: string
  repoId: string | undefined
  userInputId: string
  userId: string | undefined
}): Promise<{
  output: CodebuffToolOutput<'web_search'>
  creditsUsed: number
}> => {
  const {
    previousToolCallFinished,
    toolCall,

    agentStepId,
    clientSessionId,
    fingerprintId,
    logger,
    repoId,
    userId,
    userInputId,
  } = params
  const { query, depth } = toolCall.input

  const searchStartTime = Date.now()
  const searchContext = {
    toolCallId: toolCall.toolCallId,
    query,
    depth,
    userId,
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    repoId,
  }

  await previousToolCallFinished

  const creditsUsed = 0

  try {
    const openWebsearchBin = resolveOpenWebsearchBin(logger)
    if (!openWebsearchBin) {
      logger.error(
        { ...searchContext },
        'open-websearch binary not found in node_modules',
      )
      return {
        output: jsonToolResult({
          errorMessage:
            'open-websearch is not installed. Run: npm install open-websearch',
        }),
        creditsUsed,
      }
    }

    const limit = depth === 'deep' ? 10 : 5
    const { stdout } = await execFileAsync('node', [
      openWebsearchBin,
      'search',
      query,
      '--limit',
      String(limit),
      '--engine',
      'duckduckgo',
      '--json',
    ], { timeout: WEBSEARCH_TIMEOUT_MS })

    const parsed = JSON.parse(stdout) as {
      status?: string
      data?: {
        results?: Array<{ title: string; url: string; description: string }>
      }
      error?: string
    }

    if (parsed.error) {
      const searchDuration = Date.now() - searchStartTime
      logger.warn(
        { ...searchContext, searchDuration, error: parsed.error },
        'open-websearch returned error',
      )
      return {
        output: jsonToolResult({ errorMessage: parsed.error }),
        creditsUsed,
      }
    }

    const results = parsed.data?.results ?? []
    if (results.length === 0) {
      const searchDuration = Date.now() - searchStartTime
      logger.warn(
        { ...searchContext, searchDuration },
        'open-websearch returned no results',
      )
      return {
        output: jsonToolResult({
          errorMessage: `No search results found for "${query}"`,
        }),
        creditsUsed,
      }
    }

    const searchDuration = Date.now() - searchStartTime
    logger.info(
      {
        ...searchContext,
        searchDuration,
        resultCount: results.length,
        success: true,
      },
      'Search completed via open-websearch',
    )

    return {
      output: jsonToolResult({
        result: JSON.stringify(results, null, 2),
      }),
      creditsUsed,
    }
  } catch (error) {
    const searchDuration = Date.now() - searchStartTime

    // Detect missing Node.js (ENOENT on the 'node' command)
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      logger.error(
        { ...searchContext, searchDuration },
        'Node.js runtime not found',
      )
      return {
        output: jsonToolResult({
          errorMessage:
            'Node.js is required to run open-websearch. Please install Node.js from https://nodejs.org.',
        }),
        creditsUsed,
      }
    }

    const errorMessage = `Error performing web search for "${query}": ${
      error instanceof Error ? error.message : 'Unknown error'
    }`
    logger.error(
      {
        ...searchContext,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
        searchDuration,
        success: false,
      },
      'Search failed with error',
    )
    return { output: jsonToolResult({ errorMessage }), creditsUsed }
  }
}) satisfies CodebuffToolHandlerFunction<'web_search'>
