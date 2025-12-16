/**
 * Stateful stream XML parser that extracts tool calls from <codebuff_tool_call> XML
 * and filters them out of the text stream.
 *
 * Handles partial tags at chunk boundaries using a stateful approach.
 */

import {
  toolNameParam,
  toolXmlName,
} from '@codebuff/common/tools/constants'

// Use flexible tag matching without requiring specific newlines
const startToolTag = `<${toolXmlName}>`
const endToolTag = `</${toolXmlName}>`

export type ParsedToolCall = {
  toolName: string
  input: Record<string, unknown>
}

export type StreamParserState = {
  /** Buffer for holding partial content when inside a tool call tag or at boundaries */
  buffer: string
  /** Whether we're currently inside a tool call tag */
  insideToolCall: boolean
}

export type ParseResult = {
  /** Filtered text with tool call XML removed */
  filteredText: string
  /** Tool calls extracted from this chunk */
  toolCalls: ParsedToolCall[]
}

/**
 * Creates initial parser state
 */
export function createStreamParserState(): StreamParserState {
  return {
    buffer: '',
    insideToolCall: false,
  }
}

/**
 * Parses a stream chunk, extracting tool calls and filtering out the XML.
 *
 * @param chunk - The incoming text chunk
 * @param state - Mutable parser state (updated in place)
 * @returns Filtered text and any extracted tool calls
 */
export function parseStreamChunk(
  chunk: string,
  state: StreamParserState,
): ParseResult {
  if (!chunk) {
    return { filteredText: '', toolCalls: [] }
  }

  // Combine buffer with new chunk
  let text = state.buffer + chunk
  state.buffer = ''

  let filteredText = ''
  const toolCalls: ParsedToolCall[] = []

  while (text.length > 0) {
    if (state.insideToolCall) {
      // We're inside a tool call, look for the end tag
      const endIndex = text.indexOf(endToolTag)

      if (endIndex !== -1) {
        // Found end tag - extract the content and parse it
        const toolCallContent = text.slice(0, endIndex)
        const parsedToolCall = parseToolCallContent(toolCallContent)
        if (parsedToolCall) {
          toolCalls.push(parsedToolCall)
        }

        text = text.slice(endIndex + endToolTag.length)
        state.insideToolCall = false
      } else {
        // No end tag yet - buffer all content until we find the end tag
        state.buffer = text
        text = ''
      }
    } else {
      // We're outside a tool call, look for start tag
      const startIndex = text.indexOf(startToolTag)

      if (startIndex !== -1) {
        // Found start tag - emit text before it, then enter tool call
        filteredText += text.slice(0, startIndex)
        text = text.slice(startIndex + startToolTag.length)
        state.insideToolCall = true
      } else {
        // No start tag - check if we might have a partial start tag
        const partialStart = findPartialTagMatch(text, startToolTag)
        if (partialStart > 0) {
          // Emit everything except the partial tag, buffer the partial
          filteredText += text.slice(0, -partialStart)
          state.buffer = text.slice(-partialStart)
          text = ''
        } else {
          // No partial match, emit all
          filteredText += text
          text = ''
        }
      }
    }
  }

  return { filteredText, toolCalls }
}

/**
 * Parse the JSON content inside a tool call tag.
 */
function parseToolCallContent(content: string): ParsedToolCall | null {
  const trimmed = content.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed)
    const toolName = parsed[toolNameParam]

    if (typeof toolName !== 'string') {
      return null
    }

    // Remove internal params from the input
    const input = { ...parsed }
    delete input[toolNameParam]
    delete input['cb_easp'] // endsAgentStepParam

    return { toolName, input }
  } catch {
    // Invalid JSON - skip
    return null
  }
}

/**
 * Find if the end of `text` is a partial match for the beginning of `tag`.
 * Returns the length of the overlap, or 0 if no overlap.
 */
function findPartialTagMatch(text: string, tag: string): number {
  const maxOverlap = Math.min(text.length, tag.length - 1)

  for (let len = maxOverlap; len > 0; len--) {
    const suffix = text.slice(-len)
    const prefix = tag.slice(0, len)
    if (suffix === prefix) {
      return len
    }
  }

  return 0
}
