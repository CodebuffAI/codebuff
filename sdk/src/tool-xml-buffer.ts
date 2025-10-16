export type ToolCallBufferState = {
  buffer: string
  insideToolCall: boolean
}

export function createToolCallBufferState(): ToolCallBufferState {
  return { buffer: '', insideToolCall: false }
}

/**
 * Incrementally filters out <codebuff_tool_call> payloads from a stream while
 * emitting safe text segments via `onText`.
 *
 * This mirrors the legacy CLI helper so SDK consumers can reuse it when they
 * want to forward raw streaming output without leaking tool-call XML.
 */
import { TOOL_XML_PREFIX, TOOL_XML_CLOSE } from './tool-xml-filter'

export function processToolCallBuffer(
  state: ToolCallBufferState,
  incoming: string,
  onText: (text: string) => void,
): void {
  if (!incoming) {
    return
  }

  state.buffer += incoming

  const OPEN_TAG = `${TOOL_XML_PREFIX}>`
  const SAFETY_TAIL = Math.max(OPEN_TAG.length, TOOL_XML_CLOSE.length) + 8

  let advanced = true
  while (advanced && state.buffer) {
    advanced = false

    if (!state.insideToolCall) {
      const openIndex = state.buffer.indexOf(OPEN_TAG)
      if (openIndex !== -1) {
        const text = state.buffer.slice(0, openIndex)
        if (text) {
          onText(text)
        }
        state.buffer = state.buffer.slice(openIndex + OPEN_TAG.length)
        state.insideToolCall = true
        advanced = true
        continue
      }

      if (state.buffer.length > SAFETY_TAIL) {
        const safeLength = state.buffer.length - SAFETY_TAIL
        const text = state.buffer.slice(0, safeLength)
        if (text) {
          onText(text)
        }
        state.buffer = state.buffer.slice(safeLength)
        advanced = true
      }
    }

    if (state.insideToolCall) {
      const closeIndex = state.buffer.indexOf(TOOL_XML_CLOSE)
      if (closeIndex !== -1) {
        state.buffer = state.buffer.slice(
          closeIndex + TOOL_XML_CLOSE.length,
        )
        state.insideToolCall = false
        advanced = true
      } else if (state.buffer.length > SAFETY_TAIL) {
        state.buffer = state.buffer.slice(-SAFETY_TAIL)
      }
    }
  }

  if (!state.insideToolCall && state.buffer) {
    const OPEN_PREFIX = TOOL_XML_PREFIX
    const CLOSE_PREFIX = TOOL_XML_CLOSE.slice(0, -1)
    const buffer = state.buffer

    const looksLikeTagStart =
      buffer.includes(OPEN_PREFIX) ||
      buffer.includes(CLOSE_PREFIX) ||
      OPEN_PREFIX.startsWith(buffer) ||
      CLOSE_PREFIX.startsWith(buffer)

    if (looksLikeTagStart) {
      return
    }

    onText(buffer)
    state.buffer = ''
  }
}

export function stripToolCallPayloads(input: string): string {
  if (!input) {
    return ''
  }

  const state = createToolCallBufferState()
  const parts: string[] = []
  const OPEN_PREFIX = TOOL_XML_PREFIX
  const CLOSE_PREFIX = TOOL_XML_CLOSE.slice(0, -1)

  processToolCallBuffer(state, input, (value) => {
    if (value) {
      parts.push(value)
    }
  })

  if (!state.insideToolCall && state.buffer) {
    const buffer = state.buffer
    const looksLikeTagStart =
      buffer.includes(OPEN_PREFIX) ||
      buffer.includes(CLOSE_PREFIX) ||
      OPEN_PREFIX.startsWith(buffer) ||
      CLOSE_PREFIX.startsWith(buffer)

    if (!looksLikeTagStart) {
      parts.push(buffer)
    }
  }

  return parts.join('')
}
