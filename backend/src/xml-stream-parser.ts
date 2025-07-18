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
      params: Array<string | RegExp>
      onTagStart: (tagName: string, attributes: Record<string, string>) => void
      onTagEnd: (tagName: string, params: Record<string, any>) => void
    }
  >,
  onError: (tagName: string, errorMessage: string) => void
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
      onError('parse_error', error.message)
      return
    }

    const toolName = parsedParams[toolNameParam] as keyof typeof processors
    if (!processors[toolName]) {
      onError(toolName, `Tool not found: ${toolName}`)
    }

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
