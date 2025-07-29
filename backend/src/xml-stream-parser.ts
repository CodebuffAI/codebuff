import { trackEvent } from '@codebuff/common/analytics'
import { Model } from '@codebuff/common/constants'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import {
  endsAgentStepParam,
  endToolTag,
  startToolTag,
  toolNameParam,
} from '@codebuff/common/constants/tools'
import {
  PrintModeError,
  PrintModeText,
  PrintModeToolCall,
} from '@codebuff/common/types/print-mode'

const toolExtractionPattern = new RegExp(
  `${startToolTag}(.*?)${endToolTag}`,
  'gs'
)

const completionSuffix = `${JSON.stringify(endsAgentStepParam)}: true\n}${endToolTag}`

export async function* processStreamWithTags(
  stream: AsyncGenerator<string> | ReadableStream<string>,
  processors: Record<
    string,
    {
      onTagStart: (tagName: string, attributes: Record<string, string>) => void
      onTagEnd: (tagName: string, params: Record<string, any>) => void
    }
  >,
  onError: (tagName: string, errorMessage: string) => void,
  onResponseChunk: (
    chunk: PrintModeText | PrintModeToolCall | PrintModeError
  ) => void,
  loggerOptions?: {
    userId?: string
    model?: Model
    agentName?: string
  }
): AsyncGenerator<string> {
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
    let parsedParams: any
    try {
      parsedParams = JSON.parse(contents)
    } catch (error: any) {
      trackEvent(
        AnalyticsEvent.MALFORMED_TOOL_CALL_JSON,
        loggerOptions?.userId ?? '',
        {
          contents,
          model: loggerOptions?.model,
          agent: loggerOptions?.agentName,
          autocompleted,
        }
      )
      const shortenedContents =
        contents.length < 50
          ? contents
          : contents.slice(0, 20) + '...' + contents.slice(-20)
      const errorMessage = `Invalid JSON: ${JSON.stringify(shortenedContents)}\nError: ${error.message}`
      onResponseChunk({
        type: 'error',
        message: errorMessage,
      })
      onError('parse_error', errorMessage)
      return
    }

    const toolName = parsedParams[toolNameParam] as keyof typeof processors
    if (!processors[toolName]) {
      trackEvent(
        AnalyticsEvent.UNKNOWN_TOOL_CALL,
        loggerOptions?.userId ?? '',
        {
          contents,
          toolName,
          model: loggerOptions?.model,
          agent: loggerOptions?.agentName,
          autocompleted,
        }
      )
      onError(toolName, `Tool not found: ${toolName}`)
      return
    }

    trackEvent(AnalyticsEvent.TOOL_USE, loggerOptions?.userId ?? '', {
      toolName,
      contents,
      parsedParams,
      autocompleted,
      model: loggerOptions?.model,
      agent: loggerOptions?.agentName,
    })
    delete parsedParams[toolNameParam]

    processors[toolName].onTagStart(toolName, {})
    processors[toolName].onTagEnd(toolName, parsedParams)
  }

  function extractToolsFromBufferAndProcess() {
    const matches = extractToolCalls()
    matches.forEach(processToolCallContents)
  }

  function* processChunk(chunk: string | undefined) {
    if (chunk !== undefined) {
      buffer += chunk
    }
    extractToolsFromBufferAndProcess()

    if (chunk === undefined) {
      streamCompleted = true
      if (buffer.includes(startToolTag)) {
        buffer += completionSuffix
        chunk = completionSuffix
        autocompleted = true
      }
      extractToolsFromBufferAndProcess()
    }

    if (chunk) {
      yield chunk
    }
  }

  for await (const chunk of stream as AsyncIterable<string>) {
    if (streamCompleted) {
      break
    }
    yield* processChunk(chunk)
  }

  if (!streamCompleted) {
    // After the stream ends, try parsing one last time in case there's leftover text
    yield* processChunk(undefined)
  }

  for await (const chunk of stream as AsyncIterable<string>) {
  }
}
