import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import {
  endsAgentStepParam,
  endToolTag,
  startToolTag,
  toolNameParam,
} from '@codebuff/common/tools/constants'

import type { Model } from '@codebuff/common/old-constants'
import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { StreamChunk } from '@codebuff/common/types/contracts/llm'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  PrintModeError,
  PrintModeText,
} from '@codebuff/common/types/print-mode'

const toolExtractionPattern = new RegExp(
  `${startToolTag}(.*?)${endToolTag}`,
  'gs',
)

const completionSuffix = `${JSON.stringify(endsAgentStepParam)}: true\n}${endToolTag}`

export async function* processStreamWithTags(params: {
  stream: AsyncGenerator<StreamChunk, string | null>
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
}): AsyncGenerator<StreamChunk, string | null> {
  const {
    stream,
    processors,
    defaultProcessor,
    onError,
    onResponseChunk,
    logger,
    loggerOptions,
    trackEvent,
  } = params

  let streamCompleted = false
  let buffer = ''
  let autocompleted = false

  function extractToolCalls(): string[] {
    const matches: string[] = []
    let lastIndex = 0
    for (const match of buffer.matchAll(toolExtractionPattern)) {
      if (match.index > lastIndex) {
        onResponseChunk({
          type: 'text',
          text: buffer.slice(lastIndex, match.index),
        })
      }
      lastIndex = match.index + match[0].length
      matches.push(match[1])
    }

    buffer = buffer.slice(lastIndex)
    return matches
  }

  function processToolCallContents(contents: string): void {
    let input: any
    try {
      input = JSON.parse(contents)
    } catch (error: any) {
      trackEvent({
        event: AnalyticsEvent.MALFORMED_TOOL_CALL_JSON,
        userId: loggerOptions?.userId ?? '',
        properties: {
          contents: JSON.stringify(contents),
          model: loggerOptions?.model,
          agent: loggerOptions?.agentName,
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
          autocompleted,
        },
        logger,
      })
      const shortenedContents =
        contents.length < 200
          ? contents
          : contents.slice(0, 100) + '...' + contents.slice(-100)
      const errorMessage = `Invalid JSON: ${JSON.stringify(shortenedContents)}\nError: ${error.message}`
      onResponseChunk({
        type: 'error',
        message: errorMessage,
      })
      onError('parse_error', errorMessage)
      return
    }

    const toolName = input[toolNameParam] as keyof typeof processors
    if (typeof toolName !== 'string') {
      trackEvent({
        event: AnalyticsEvent.UNKNOWN_TOOL_CALL,
        userId: loggerOptions?.userId ?? '',
        properties: {
          contents,
          toolName,
          model: loggerOptions?.model,
          agent: loggerOptions?.agentName,
          autocompleted,
        },
        logger,
      })
      onError(
        'parse_error',
        `Unknown tool ${JSON.stringify(toolName)} for tool call: ${contents}`,
      )
      return
    }

    delete input[toolNameParam]
    processToolCallObject({ toolName, input, contents })
  }

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

  function extractToolsFromBufferAndProcess(forceFlush = false) {
    const matches = extractToolCalls()
    matches.forEach(processToolCallContents)
    if (forceFlush) {
      if (buffer) {
        onResponseChunk({
          type: 'text',
          text: buffer,
        })
      }
      buffer = ''
    }
  }

  function* processChunk(
    chunk: StreamChunk | undefined,
  ): Generator<StreamChunk> {
    if (chunk !== undefined && chunk.type === 'text') {
      buffer += chunk.text
    }
    if (chunk && chunk.type === 'tool-call') {
      extractToolsFromBufferAndProcess(true)
      processToolCallObject(chunk)
    } else {
      extractToolsFromBufferAndProcess()
    }

    if (chunk === undefined) {
      streamCompleted = true
      if (buffer.includes(startToolTag)) {
        buffer += completionSuffix
        chunk = {
          type: 'text',
          text: completionSuffix,
        }
        autocompleted = true
      }
      extractToolsFromBufferAndProcess(true)
    }

    if (chunk) {
      yield chunk
    }
  }

  let messageId: string | null = null
  while (true) {
    const { value, done } = await stream.next()
    if (done) {
      messageId = value
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

  return messageId
}
