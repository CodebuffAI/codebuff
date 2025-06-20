import { ToolResult } from 'common/types/session-state'

import {
  parseReadFilesResult,
  parseToolResults,
  renderToolResults,
} from './parse-tool-call-xml'

/**
 * Helper function to simplify tool results of a specific type while preserving others.
 * Extracts results of the specified tool type, applies a simplification function to them,
 * and combines them back with other unchanged tool results.
 * @param messageContent - The message content containing tool results, either as a string or array
 * @param toolName - The name of the tool whose results should be simplified
 * @param simplifyFn - Function to apply to each matching tool result
 * @returns The message content with simplified results for the specified tool type
 */
function simplifyToolResults(
  messageContent: string | object[],
  toolName: string,
  simplifyFn: (result: ToolResult) => ToolResult
): string {
  const resultsStr =
    typeof messageContent === 'string'
      ? messageContent
      : ((messageContent[messageContent.length - 1] as any)?.text as string) ??
        ''
  if (!resultsStr.includes('<tool_result')) {
    return resultsStr
  }

  const toolResults = parseToolResults(resultsStr)
  const targetResults = toolResults.filter(
    (result) => result.toolName === toolName
  )

  if (targetResults.length === 0) {
    return resultsStr
  }

  // Keep non-target results unchanged
  const otherResults = toolResults.filter(
    (result) => result.toolName !== toolName
  )

  // Create simplified results
  const simplifiedResults = targetResults.map(simplifyFn)

  // Combine both types of results
  return renderToolResults([...simplifiedResults, ...otherResults])
}

/**
 * Simplifies read_files tool results to show only file paths while preserving other tool results.
 * Useful for making tool result output more concise in message history.
 * @param messageContent - The message content containing tool results
 * @returns The message content with simplified read_files results showing only paths
 */
export function simplifyReadFileResults(
  messageContent: string | object[]
): string {
  return simplifyToolResults(
    messageContent,
    'read_files',
    simplifyReadFileToolResult
  )
}

/**
 * Simplifies terminal command tool results to show a brief summary while preserving other tool results.
 * Useful for making tool result output more concise in message history.
 * @param messageContent - The message content containing tool results
 * @returns The message content with simplified terminal command results
 */
export function simplifyTerminalCommandResults(
  messageContent: string | object[]
): string {
  return simplifyToolResults(
    messageContent,
    'run_terminal_command',
    simplifyTerminalCommandToolResult
  )
}

/**
 * Simplifies a single read_files tool result by extracting just the file paths.
 * @param toolResult - The read_files tool result to simplify
 * @returns A new tool result with just the list of file paths that were read
 */
export function simplifyReadFileToolResult(toolResult: ToolResult): ToolResult {
  const fileBlocks = parseReadFilesResult(toolResult.result)
  const filePaths = fileBlocks.map((block) => block.path)
  return {
    toolCallId: toolResult.toolCallId,
    toolName: 'read_files',
    result: `Read the following files: ${filePaths.join('\n')}`,
  }
}

/**
 * Simplifies a single terminal command tool result by replacing output with a brief message.
 * @param toolResult - The terminal command tool result to simplify
 * @returns A new tool result with shortened output if the original was long
 */
export function simplifyTerminalCommandToolResult(
  toolResult: ToolResult
): ToolResult {
  const shortenedResultCandidate = '[Output omitted]'
  return shortenedResultCandidate.length < toolResult.result.length
    ? {
        toolCallId: toolResult.toolCallId,
        toolName: 'run_terminal_command',
        result: shortenedResultCandidate,
      }
    : toolResult
}
