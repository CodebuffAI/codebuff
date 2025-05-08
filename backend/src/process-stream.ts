import { Saxy } from 'common/util/saxy'

export async function* processStreamWithTags<T extends string>(
  stream: AsyncGenerator<T> | ReadableStream<T>,
  processors: {
    [tagName: string]: {
      params: Array<string>
      onTagStart: (attributes: Record<string, string>, errors: string[]) => void
      onTagEnd: (params: Record<string, string>) => void
    }
  },
  defaultProcessor: {
    onTagStart: (
      tagName: string,
      attributes: Record<string, string>,
      errors: string[]
    ) => void
    onTagEnd: (tagName: string) => void
  }
) {
  let currentTool: string | null = null
  let currentParam: string | null = null
  let params: Record<string, string> = {}
  let paramContent = ''

  const parser = new Saxy()
  parser.on('tagopen', (tag) => {
    const tagName = tag.name
    const { attrs, errors } = Saxy.parseAttrs(tag.attrs)
    if (currentTool === null) {
      // Parse tool
      if (tagName in processors) {
        currentTool = tagName
        currentParam = null
        params = { ...attrs }
        processors[currentTool].onTagStart(attrs, errors)
      } else {
        defaultProcessor.onTagStart(tagName, attrs, errors)
      }
      return
    }

    if (!processors[currentTool].params.includes(tagName)) {
      // Invalid parameter
      defaultProcessor.onTagStart(tagName, attrs, errors)
      return
    }

    currentParam = tagName
    paramContent = ''
  })

  parser.on('text', (data) => {
    if (currentTool === null || currentParam === null) {
      return
    }

    paramContent += data.contents
  })

  parser.on('tagclose', (tag) => {
    const tagName = tag.name

    if (currentTool === null) {
      // Invalid state
      defaultProcessor.onTagEnd(tagName)
      return
    }

    if (currentParam !== null && currentParam !== tagName) {
      // Invalid parameter closing
      defaultProcessor.onTagEnd(tagName)
      return
    }

    if (tagName === currentParam) {
      // Parameter closing
      params[currentParam] = paramContent
      currentParam = null
      paramContent = ''
      return
    }

    if (tagName !== currentTool) {
      // Invalid tool closing
      defaultProcessor.onTagEnd(tagName)
      return
    }

    processors[tagName].onTagEnd(params)
    currentTool = null
    params = {}
  })

  let streamCompleted = false

  function* parseBuffer(
    chunk: string | undefined
  ): Generator<string, void, unknown> {
    streamCompleted = chunk === undefined
    if (chunk) {
      yield chunk
    }

    if (chunk !== undefined) {
      parser.write(chunk)
    } else {
      if (currentParam !== null) {
        const closeParam = `</${currentParam}>\n`
        parser.write(closeParam)
        yield closeParam
      }
      if (currentTool !== null) {
        const closeTool = `</${currentTool}>\n`
        parser.write(closeTool)
        yield closeTool
      }
      parser.end()
    }
  }

  for await (const chunk of stream) {
    if (streamCompleted) {
      break
    }
    yield* parseBuffer(chunk)
  }

  if (!streamCompleted) {
    // After the stream ends, try parsing one last time in case there's leftover text
    yield* parseBuffer(undefined)
  }
}
