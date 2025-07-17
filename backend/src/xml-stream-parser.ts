import { suffixPrefixOverlap } from '@codebuff/common/util/string'

export async function* processStreamWithTags<T extends string>(
  stream: AsyncGenerator<T> | ReadableStream<T>,
  processors: Record<
    string,
    {
      params: Array<string | RegExp>
      onTagStart: (tagName: string, attributes: Record<string, string>) => void
      onTagEnd: (tagName: string, params: Record<string, any>) => void
    }
  >,
  onError: (tagName: string, errorMessage: string) => void
) {
  const matches = Object.keys(processors).flatMap((tool) => [
    `\n<codebuff_tool_${tool}>`,
    `\n</codebuff_tool_${tool}>`,
  ])

  let streamCompleted = false
  let buffer = ''
  let currentTool: string | null = null
  function* processChunk(chunk: string | undefined) {
    if (chunk === undefined) {
      streamCompleted = true
    }

    let chunkStr =
      chunk !== undefined
        ? chunk
        : currentTool !== null
          ? `</codebuff_tool_${currentTool}>`
          : undefined
    if (chunkStr === undefined) {
      return
    }
    yield chunkStr

    for (const c of chunkStr) {
      buffer += c
      let suffix = ''
      for (const match of matches) {
        const newSuffix = suffixPrefixOverlap(buffer, match)
        if (newSuffix.length > suffix.length) {
          suffix = newSuffix
        }
      }
      if (!suffix.endsWith('>')) {
        continue
      }

      handleTags: if (suffix.startsWith('\n</codebuff_tool_')) {
        const tool = suffix.slice('\n</codebuff_tool_'.length, -'>'.length)
        const openTag = `\n<codebuff_tool_${tool}>\n`
        const previousIndex = buffer.lastIndexOf(openTag)
        if (previousIndex === -1) {
          onError(tool, `Unexpected closing tag: ${JSON.stringify(suffix)}`)
          break handleTags
        }

        const content = buffer.slice(
          previousIndex + openTag.length,
          buffer.length - suffix.length
        )

        if (!processors[tool]) {
          onError(tool, `Tool not found: ${tool}`)
          break handleTags
        }

        let params: Record<string, any>
        try {
          params = JSON.parse(content)
        } catch (error: any) {
          onError(tool, `Failed to parse params for tool: ${error.message}`)
          break handleTags
        }

        processors[tool].onTagEnd(tool, params)

        buffer = ''
        currentTool = null
      } else if (suffix.startsWith('\n<codebuff_tool_')) {
        const tool = suffix.slice('\n<codebuff_tool_'.length, -'>'.length)
        currentTool = tool
        if (!processors[tool]) {
          break handleTags
        }
        processors[tool].onTagStart(tool, {})
        buffer = suffix
      }
      if (currentTool === null) {
        buffer = suffix
      }
    }
  }

  for await (const chunk of stream as AsyncIterable<T>) {
    if (streamCompleted) {
      break
    }
    yield* processChunk(chunk)
  }

  if (!streamCompleted) {
    // After the stream ends, try parsing one last time in case there's leftover text
    yield* processChunk(undefined)
  }

  for await (const chunk of stream as AsyncIterable<T>) {
  }
}
