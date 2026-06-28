import { getErrorObject } from '@codebuff/common/util/error'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const OUTPUT_EXCERPT_LIMIT = 2_000

function getOutputExcerpt(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.length > OUTPUT_EXCERPT_LIMIT
    ? `${trimmed.slice(0, OUTPUT_EXCERPT_LIMIT)}...`
    : trimmed
}

function summarizeCommandStatus(exitCode: unknown): 'passed' | 'failed' | 'unknown' {
  if (typeof exitCode !== 'number') return 'unknown'
  return exitCode === 0 ? 'passed' : 'failed'
}

export function simplifyReadFileResults(
  messageContent: CodebuffToolOutput<'read_files'>,
): CodebuffToolOutput<'read_files'> {
  return [
    {
      type: 'json',
      value: structuredClone(messageContent[0]).value.map((entry) => {
        if ('summary' in entry) {
          return entry
        }
        return {
          path: entry.path,
          contentOmittedForLength: true,
        }
      }),
    },
  ]
}

export function simplifyTerminalCommandResults(params: {
  messageContent: CodebuffToolOutput<'run_terminal_command'>
  logger: Logger
}): CodebuffToolOutput<'run_terminal_command'> {
  const { messageContent, logger } = params
  try {
    const clone = structuredClone(messageContent)
    const content = clone[0].value
    if ('processId' in content || 'errorMessage' in content) {
      return clone
    }
    const { command, message, exitCode, stderr } = content
    const stdout = 'stdout' in content ? content.stdout : undefined
    const status = summarizeCommandStatus(exitCode)
    const stderrExcerpt = getOutputExcerpt(stderr)
    const stdoutExcerpt = status === 'failed' ? getOutputExcerpt(stdout) : undefined

    return [
      {
        type: 'json',
        value: {
          command,
          status,
          ...(message && { message }),
          stdoutOmittedForLength: true,
          ...(stderrExcerpt && { stderrExcerpt }),
          ...(stdoutExcerpt && { stdoutExcerpt }),
          ...(exitCode !== undefined && { exitCode }),
        },
      },
    ]
  } catch (error) {
    logger.error(
      { error: getErrorObject(error), messageContent },
      'Error simplifying terminal command results',
    )
    return [
      {
        type: 'json',
        value: {
          command: '',
          status: 'unknown',
          stdoutOmittedForLength: true,
        },
      },
    ]
  }
}

/**
 * Summarize a code_search tool result by omitting the large stdout blob while
 * preserving the message, status, and excerpts. Idempotent: already-simplified
 * results are returned as-is.
 */
export function simplifyCodeSearchResults(
  messageContent: CodebuffToolOutput<'code_search'>,
): CodebuffToolOutput<'code_search'> {
  const clone = structuredClone(messageContent)
  const content = clone[0].value
  if ('errorMessage' in content || 'stdoutOmittedForLength' in content) {
    return clone
  }
  const { message, exitCode, stderr } = content
  const stdout = 'stdout' in content ? content.stdout : undefined
  const status = summarizeCommandStatus(exitCode)
  const stdoutExcerpt = getOutputExcerpt(stdout)
  const stderrExcerpt = getOutputExcerpt(stderr)

  return [
    {
      type: 'json',
      value: {
        message,
        status,
        stdoutOmittedForLength: true,
        ...(stdoutExcerpt && { stdoutExcerpt }),
        ...(stderrExcerpt && { stderrExcerpt }),
        ...(exitCode !== undefined && { exitCode }),
      },
    },
  ]
}

/**
 * Summarize a read_subtree tool result by omitting the large printedTree strings
 * and variable arrays while preserving paths, types, and metadata. Idempotent.
 */
export function simplifyReadSubtreeResults(
  messageContent: CodebuffToolOutput<'read_subtree'>,
): CodebuffToolOutput<'read_subtree'> {
  const clone = structuredClone(messageContent)
  const entries = clone[0].value
  return [
    {
      type: 'json',
      value: entries.map((entry) => {
        if ('errorMessage' in entry) {
          return entry
        }
        if (entry.type === 'directory') {
          if ('printedTreeOmittedForLength' in entry) {
            return entry
          }
          const { path, type, tokenCount, truncationLevel } = entry
          return {
            path,
            type,
            tokenCount,
            truncationLevel,
            printedTreeOmittedForLength: true,
          }
        }
        // File entry
        if ('variablesOmittedForLength' in entry) {
          return entry
        }
        const { path, type } = entry
        return { path, type, variablesOmittedForLength: true }
      }),
    },
  ]
}

/**
 * Summarize a query_index tool result by omitting the large matchedSnippets and
 * relatedFiles arrays while preserving paths, scores, symbols, and headings.
 * Idempotent.
 */
export function simplifyQueryIndexResults(
  messageContent: CodebuffToolOutput<'query_index'>,
): CodebuffToolOutput<'query_index'> {
  const clone = structuredClone(messageContent)
  const content = clone[0].value
  return [
    {
      type: 'json',
      value: {
        ...content,
        results: content.results.map((r) => {
          if ('matchedSnippetsOmittedForLength' in r) {
            return r
          }
          const { matchedSnippets, relatedFiles, ...rest } = r
          void matchedSnippets
          return {
            ...rest,
            matchedSnippetsOmittedForLength: true,
            ...(relatedFiles && { relatedFilesOmittedForLength: true }),
          }
        }),
      },
    },
  ]
}

/**
 * Summarize a web_search tool result by omitting the large result string while
 * preserving an excerpt and up to 5 links. Idempotent.
 */
export function simplifyWebSearchResults(
  messageContent: CodebuffToolOutput<'web_search'>,
): CodebuffToolOutput<'web_search'> {
  const clone = structuredClone(messageContent)
  const content = clone[0].value
  if ('errorMessage' in content || 'resultOmittedForLength' in content) {
    return clone
  }
  const { result, links } = content
  const resultExcerpt = getOutputExcerpt(result)

  return [
    {
      type: 'json',
      value: {
        resultOmittedForLength: true,
        ...(resultExcerpt && { resultExcerpt }),
        ...(links && { links: links.slice(0, 5) }),
      },
    },
  ]
}

/**
 * Set of tool names whose results can be summarized (rather than dropped
 * wholesale) when trimming the message history to fit within token limits.
 */
export const SUMMARIZABLE_TOOL_NAMES: Set<string> = new Set([
  'run_terminal_command',
  'code_search',
  'read_subtree',
  'query_index',
  'web_search',
  'read_files',
])

/**
 * Dispatcher that simplifies a tool result's content based on the tool name.
 * Returns the original content if the tool is not summarizable or if
 * simplification fails (with an error log). Each per-tool simplifier is
 * idempotent, so calling this on already-simplified content is safe.
 */
export function simplifyToolResultContent(params: {
  toolName: string
  content: CodebuffToolOutput
  logger: Logger
}): CodebuffToolOutput {
  const { toolName, content, logger } = params
  try {
    switch (toolName) {
      case 'run_terminal_command':
        return simplifyTerminalCommandResults({
          messageContent: content as CodebuffToolOutput<'run_terminal_command'>,
          logger,
        })
      case 'code_search':
        return simplifyCodeSearchResults(
          content as CodebuffToolOutput<'code_search'>,
        )
      case 'read_subtree':
        return simplifyReadSubtreeResults(
          content as CodebuffToolOutput<'read_subtree'>,
        )
      case 'query_index':
        return simplifyQueryIndexResults(
          content as CodebuffToolOutput<'query_index'>,
        )
      case 'web_search':
        return simplifyWebSearchResults(
          content as CodebuffToolOutput<'web_search'>,
        )
      case 'read_files':
        return simplifyReadFileResults(
          content as CodebuffToolOutput<'read_files'>,
        )
      default:
        return content
    }
  } catch (error) {
    logger.error(
      { error: getErrorObject(error), toolName },
      'Error simplifying tool result',
    )
    return content
  }
}
