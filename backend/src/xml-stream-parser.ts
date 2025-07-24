import { trackEvent } from '@codebuff/common/analytics'
import { Model } from '@codebuff/common/constants'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import {
  endsAgentStepParam,
  endToolTag,
  startToolTag,
  toolNameParam,
} from '@codebuff/common/constants/tools'
import { suffixPrefixOverlap } from '@codebuff/common/util/string'

const toolExtractionPattern = new RegExp(
  `${startToolTag}(.*?)${endToolTag}`,
  'gs'
)

const completionSuffix = `${JSON.stringify(endsAgentStepParam)}: true\n}${endToolTag}`

function removeProcessedToolCalls(buffer: string): string {
  const suffix = suffixPrefixOverlap(buffer, startToolTag)
  if (suffix) {
    return suffix
  }

  const lastIndex = buffer.lastIndexOf(startToolTag)
  if (lastIndex === -1) {
    return ''
  }

  return buffer.slice(lastIndex)
}

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
  loggerOptions?: {
    userId?: string
    model?: Model
    agentName?: string
  }
): AsyncGenerator<string> {
  let streamCompleted = false
  let buffer = ''

  function extractToolCalls(): string[] {
    const matches: string[] = []
    let lastIndex = -1
    for (const match of buffer.matchAll(toolExtractionPattern)) {
      lastIndex = match.index + match[0].length
      matches.push(match[1])
    }

    if (lastIndex === -1) {
      lastIndex = 0
    }
    buffer = removeProcessedToolCalls(buffer.slice(lastIndex))
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
        }
      )
      const shortenedContents =
        contents.length < 50
          ? contents
          : contents.slice(0, 20) + '...' + contents.slice(-20)
      onError(
        'parse_error',
        `Invalid JSON: ${JSON.stringify(shortenedContents)}\nError: ${error.message}`
      )
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
        }
      )
      onError(toolName, `Tool not found: ${toolName}`)
      return
    }

    trackEvent(AnalyticsEvent.TOOL_USE, loggerOptions?.userId ?? '', {
      toolName,
      contents,
      parsedParams,
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
      if (buffer) {
        buffer += completionSuffix
        chunk = completionSuffix
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
