import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import {
  createStreamParserState,
  parseStreamChunk,
} from './util/stream-xml-parser'

import type { StreamParserState } from './util/stream-xml-parser'
import type { Model } from '@codebuff/common/old-constants'
import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { StreamChunk } from '@codebuff/common/types/contracts/llm'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  PrintModeError,
  PrintModeText,
} from '@codebuff/common/types/print-mode'
import type { PromptResult } from '@codebuff/common/util/error'

export async function* processStreamWithTools(params: {
  stream: AsyncGenerator<StreamChunk, PromptResult<string | null>>
  processors: Record<
    string,
    {
      onTagStart: (tagName: string, attributes: Record<string, string>) => void
      onTagEnd: (tagName: string, params: Record<string, any>) => void
    }
  >
  defaultProcessor: (toolName: string) => {
    onTagStart: (tagName: string, attributes: Record<string, string>) => void
    onTagEnd: (tagName: string, params: Record<string, any>) => void
  }
  onError: (tagName: string, errorMessage: string) => void
  onResponseChunk: (chunk: PrintModeText | PrintModeError) => void
  logger: Logger
  loggerOptions?: {
    userId?: string
    model?: Model
    agentName?: string
  }
  trackEvent: TrackEventFn
  executeXmlToolCall: (params: {
    toolCallId: string
    toolName: string
    input: Record<string, unknown>
  }) => Promise<void>
}): AsyncGenerator<StreamChunk, PromptResult<string | null>> {
  const {
    stream,
    processors,
    defaultProcessor,
    onError: _onError,
    onResponseChunk,
    logger,
    loggerOptions,
    trackEvent,
    executeXmlToolCall,
  } = params
  let streamCompleted = false
  let buffer = ''
  let autocompleted = false

  // State for parsing XML tool calls from text stream
  const xmlParserState: StreamParserState = createStreamParserState()

  function processToolCallObject(params: {
    toolName: string
    input: any
    contents?: string
  }): void {
    const { toolName, input, contents } = params

    const processor = processors[toolName] ?? defaultProcessor(toolName)

    trackEvent({
      event: AnalyticsEvent.TOOL_USE,
      userId: loggerOptions?.userId ?? '',
      properties: {
        toolName,
        contents,
        parsedParams: input,
        autocompleted,
        model: loggerOptions?.model,
        agent: loggerOptions?.agentName,
      },
      logger,
    })

    processor.onTagStart(toolName, {})
    processor.onTagEnd(toolName, input)
  }

  function flush() {
    if (buffer) {
      onResponseChunk({
        type: 'text',
        text: buffer,
      })
    }
    buffer = ''
  }

  async function* processChunk(
    chunk: StreamChunk | undefined,
  ): AsyncGenerator<StreamChunk> {
    if (chunk === undefined) {
      flush()
      streamCompleted = true
      return
    }

    if (chunk.type === 'text') {
      // Parse XML tool calls from the text stream
      const { filteredText, toolCalls } = parseStreamChunk(
        chunk.text,
        xmlParserState,
      )

      if (filteredText) {
        buffer += filteredText
        yield {
          type: 'text',
          text: filteredText,
        }
      }

      // Flush buffer before yielding tool calls so text event is sent first
      if (toolCalls.length > 0) {
        flush()
      }

      // Then process and yield any XML tool calls found
      for (const toolCall of toolCalls) {
        const toolCallId = `xml-${crypto.randomUUID().slice(0, 8)}`

        // Execute the tool immediately if callback provided, pausing the stream
        // The callback handles emitting tool_call and tool_result events
        await executeXmlToolCall({
          toolCallId,
          toolName: toolCall.toolName,
          input: toolCall.input,
        })
      }
      return
    } else {
      flush()
    }

    if (chunk.type === 'tool-call') {
      processToolCallObject(chunk)
    }

    yield chunk
  }

  let result: PromptResult<string | null> = { aborted: false, value: null }
  while (true) {
    const { value, done } = await stream.next()
    if (done) {
      result = value
      break
    }
    if (streamCompleted) {
      break
    }
    yield* processChunk(value)
  }
  if (!streamCompleted) {
    // After the stream ends, try parsing one last time in case there's leftover text
    yield* processChunk(undefined)
  }
  return result
}
