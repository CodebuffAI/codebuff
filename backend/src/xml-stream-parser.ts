import { Saxy } from 'common/util/saxy'

interface PendingState {
  currentTool: null
  params: null
  reportedStrayText: null
  currentParam: null
  paramContent: null
}

interface ParsingToolState {
  currentTool: string
  params: Record<string, string>
  reportedStrayText: boolean
  currentParam: null
  paramContent: null
}

interface ParsingParamState {
  currentTool: string
  params: Record<string, string>
  reportedStrayText: boolean
  currentParam: string
  paramContent: string
}

type State = PendingState | ParsingToolState | ParsingParamState

export async function* processStreamWithTags<T extends string>(
  stream: AsyncGenerator<T> | ReadableStream<T>,
  processors: Record<
    string,
    {
      params: Array<string>
      onTagStart: (tagName: string, attributes: Record<string, string>) => void
      onTagEnd: (tagName: string, params: Record<string, string>) => void
    }
  >,
  onError: (tagName: string, errorMessage: string) => void
) {
  function startTool(
    state: PendingState,
    toolName: string,
    attributes: Record<string, string>
  ): PendingState | ParsingToolState {
    if (!(toolName in processors)) {
      onError(toolName, 'Ignoring non-tool XML tag')
      return state
    }

    if (state.currentTool !== null) {
      onError(
        toolName,
        `New tool started while parsing tool ${state.currentTool}. Ending current tool`
      )
      state = endTool(state)
    }

    processors[toolName].onTagStart(toolName, attributes)
    const params: Record<string, string> = {}
    const extraAttrs: string[] = []
    for (const [key, value] of Object.entries(attributes)) {
      if (!processors[toolName].params.includes(key)) {
        extraAttrs.push(key)
        continue
      }

      params[key] = value
    }
    if (extraAttrs.length) {
      onError(
        toolName,
        `Ignoring extra parameters found in ${toolName} attributes: ${JSON.stringify(extraAttrs)}`
      )
    }
    return {
      currentTool: toolName,
      params,
      reportedStrayText: false,
      currentParam: null,
      paramContent: null,
    }
  }

  function startParam(
    state: ParsingToolState | ParsingParamState,
    paramName: string,
    attributes: Record<string, string>
  ): State {
    if (state.currentParam !== null) {
      if (processors[state.currentTool].params.includes(paramName)) {
        onError(
          state.currentTool,
          `New parameter started while parsing param ${state.currentParam} of ${state.currentTool}. Ending current param`
        )
        return {
          ...endParam(state),
          currentParam: paramName,
          paramContent: '',
        }
      } else if (paramName in processors) {
        onError(
          state.currentTool,
          `New tool started while parsing param ${state.currentParam} of ${state.currentTool}. Ending current tool`
        )
        return startTool(endTool(state), paramName, attributes)
      }
      onError(paramName, `Ignoring stray XML tag`)
      return state
    }

    if (paramName in processors) {
      onError(
        state.currentTool,
        `New tool started while parsing tool ${state.currentTool}. Ending current tool`
      )
      return startTool(endTool(state), paramName, attributes)
    }

    if (!processors[state.currentTool].params.includes(paramName)) {
      onError(paramName, `Ignoring stray XML tag`)
      return state
    }
    return {
      ...state,
      currentParam: paramName,
      paramContent: '',
    }
  }

  function endParam(
    state: ParsingToolState | ParsingParamState
  ): ParsingToolState {
    if (state.currentParam === null) {
      return state
    }

    if (state.currentParam in state.params) {
      onError(
        state.currentTool,
        `Found duplicate parameter value for ${state.currentParam} of ${state.currentTool}. Overwriting with newer value`
      )
    }
    state.params[state.currentParam] = state.paramContent
    return { ...state, currentParam: null, paramContent: null }
  }

  function endTool(state: State): PendingState {
    if (state.currentTool === null) {
      return state
    }

    if (state.currentParam !== null) {
      onError(
        state.currentTool,
        `Found end of tool while parsing parameter ${state.currentParam}. Auto-closing parameter`
      )
      state = endParam(state)
    }

    processors[state.currentTool].onTagEnd(state.currentTool, state.params)
    return {
      currentTool: null,
      params: null,
      reportedStrayText: null,
      currentParam: null,
      paramContent: null,
    }
  }

  let state: State = {
    currentTool: null,
    currentParam: null,
    reportedStrayText: null,
    params: null,
    paramContent: null,
  }
  const parser = new Saxy()
  parser.on('tagopen', (tag) => {
    const tagName = tag.name
    const { attrs, errors } = Saxy.parseAttrs(tag.attrs)
    for (const error of errors) {
      onError(tagName, error)
    }
    if (state.currentTool === null) {
      state = startTool(state, tagName, attrs)
      return
    }
    state = startParam(state, tagName, attrs)
  })

  parser.on('text', (data) => {
    if (state.currentTool === null) {
      return
    }

    if (state.currentParam === null) {
      if (state.reportedStrayText) {
        return
      }
      if (data.contents.trim() === '') {
        return
      }
      onError(
        state.currentTool,
        `Ignoring text in ${state.currentTool} between parameters`
      )
      state.reportedStrayText = true
      return
    }

    state.paramContent += data.contents
  })

  parser.on('tagclose', (tag) => {
    const tagName = tag.name

    if (tagName === state.currentParam) {
      state = endParam(state)
      return
    }

    if (tagName === state.currentTool) {
      state = endTool(state)
      return
    }

    onError(tagName, 'Ignoring stray closing tag')
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
      return
    }

    if (state.currentParam !== null) {
      const closeParam = `</${state.currentParam}>\n`
      parser.write(closeParam)
      yield closeParam
    }
    if (state.currentTool !== null) {
      const closeTool = `</${state.currentTool}>\n`
      parser.write(closeTool)
      yield closeTool
    }
    parser.end()
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
