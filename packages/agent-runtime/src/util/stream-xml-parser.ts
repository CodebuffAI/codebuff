/**
 * Stateful stream XML parser that extracts tool calls from <codebuff_tool_call> XML
 * and filters them out of the text stream.
 *
 * Handles partial tags at chunk boundaries using a stateful approach.
 */

import { toolNameParam, toolXmlName } from '@codebuff/common/tools/constants'
import { parseJsonStringWithRepair } from '@codebuff/common/tools/params/utils'

// Use flexible tag matching without requiring specific newlines
const startToolTag = `<${toolXmlName}>`
const endToolTag = `</${toolXmlName}>`
const DEFAULT_MAX_TOOL_CALL_BUFFER_LENGTH = 64 * 1024

export type ParsedToolCall = {
  toolName: string
  input: Record<string, unknown>
}

export type StreamParserError = {
  code:
    | 'tool_call_buffer_exceeded'
    | 'invalid_tool_call_json'
    | 'missing_tool_name'
  message: string
  bufferedLength?: number
  maxBufferLength?: number
}

export type StreamParserState = {
  /** Buffer for holding partial content when inside a tool call tag or at boundaries */
  buffer: string
  /** Whether we're currently inside a tool call tag */
  insideToolCall: boolean
  /** Maximum buffered XML tool-call content before truncating with an error */
  maxToolCallBufferLength: number
}

export type ParseResult = {
  /** Filtered text with tool call XML removed */
  filteredText: string
  /** Tool calls extracted from this chunk */
  toolCalls: ParsedToolCall[]
  /** Structured parser errors encountered while extracting tool calls */
  errors: StreamParserError[]
}

/**
 * Creates initial parser state
 */
export function createStreamParserState(options?: {
  maxToolCallBufferLength?: number
}): StreamParserState {
  return {
    buffer: '',
    insideToolCall: false,
    maxToolCallBufferLength:
      options?.maxToolCallBufferLength ?? DEFAULT_MAX_TOOL_CALL_BUFFER_LENGTH,
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
    return { filteredText: '', toolCalls: [], errors: [] }
  }

  // Combine buffer with new chunk
  let text = state.buffer + chunk
  state.buffer = ''

  let filteredText = ''
  const toolCalls: ParsedToolCall[] = []
  const errors: StreamParserError[] = []

  while (text.length > 0) {
    if (state.insideToolCall) {
      // We're inside a tool call, look for the end tag
      const endIndex = text.indexOf(endToolTag)

      if (endIndex !== -1) {
        // Found end tag - extract the content and parse it
        const toolCallContent = text.slice(0, endIndex)
        const parsedToolCall = parseToolCallContent(toolCallContent)
        if (parsedToolCall.toolCall) {
          toolCalls.push(parsedToolCall.toolCall)
        }
        if (parsedToolCall.error) {
          errors.push(parsedToolCall.error)
        }

        text = text.slice(endIndex + endToolTag.length)
        state.insideToolCall = false
      } else if (text.length > state.maxToolCallBufferLength) {
        errors.push({
          code: 'tool_call_buffer_exceeded',
          message: `Discarded unterminated ${toolXmlName} content after ${text.length} buffered characters (limit ${state.maxToolCallBufferLength}).`,
          bufferedLength: text.length,
          maxBufferLength: state.maxToolCallBufferLength,
        })
        state.insideToolCall = false
        state.buffer = ''
        text = ''
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

  return { filteredText, toolCalls, errors }
}

/**
 * Parse the JSON content inside a tool call tag.
 */
function parseToolCallContent(content: string): {
  toolCall?: ParsedToolCall
  error?: StreamParserError
} {
  const normalized = normalizeToolCallJsonContent(content)
  if (!normalized) {
    return {
      error: {
        code: 'invalid_tool_call_json',
        message: `Ignored empty ${toolXmlName} content.`,
      },
    }
  }

  try {
    const parsed = parseToolCallJson(normalized)
    if (!isRecord(parsed)) {
      return {
        error: {
          code: 'invalid_tool_call_json',
          message: `Ignored ${toolXmlName} content because it did not parse to a JSON object.`,
        },
      }
    }

    const toolName = parsed[toolNameParam]

    if (typeof toolName !== 'string') {
      return {
        error: {
          code: 'missing_tool_name',
          message: `Ignored ${toolXmlName} content because ${toolNameParam} was missing or not a string.`,
        },
      }
    }

    // Remove internal params from the input
    const input = { ...parsed }
    delete input[toolNameParam]
    delete input['cb_easp'] // endsAgentStepParam

    return { toolCall: { toolName, input } }
  } catch (err) {
    return {
      error: {
        code: 'invalid_tool_call_json',
        message: `Ignored ${toolXmlName} content because JSON parsing failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
    }
  }
}

function parseToolCallJson(normalized: string): unknown {
  return parseJsonStringWithRepair(normalized)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeToolCallJsonContent(content: string): string {
  let normalized = content.trim()
  if (!normalized) {
    return ''
  }

  // Models often wrap the JSON in a markdown fence even though the XML tag is
  // already the delimiter. Strip common fences before parsing.
  const fenceMatch = normalized.match(
    /^```(?:json|javascript|js)?\s*([\s\S]*?)\s*```$/i,
  )
  if (fenceMatch) {
    normalized = fenceMatch[1].trim()
  }

  // If the model includes explanatory text inside the XML tag, keep the JSON
  // object itself. This is intentionally conservative and only extracts a
  // complete outer object.
  const firstBrace = normalized.indexOf('{')
  const lastBrace = normalized.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    normalized = normalized.slice(firstBrace, lastBrace + 1)
  }

  return normalized
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
