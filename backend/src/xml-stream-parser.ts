import { Saxy, TagCloseNode, TagOpenNode, TextNode } from 'common/util/saxy'
import { includesMatch } from 'common/util/string'

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
      params: Array<string | RegExp>
      onTagStart: (tagName: string, attributes: Record<string, string>) => void
      onTagEnd: (tagName: string, params: Record<string, string>) => void
    }
  >,
  onError: (tagName: string, errorMessage: string) => void
) {
  /**
   * @param state current state
   * @param toolName must be a key in processors
   * @param attributes Record of attributes
   * @returns new state
   */
  function startTool(
    state: PendingState,
    toolName: string,
    attributes: Record<string, string>
  ): PendingState | ParsingToolState {
    if (state.currentTool !== null) {
      onError(
        toolName,
        `WARN: New tool started while parsing tool ${state.currentTool}. Ending current tool. Make sure to close all tool calls!`
      )
      state = endTool(state)
    }

    processors[toolName].onTagStart(toolName, attributes)
    const params: Record<string, string> = {}
    const extraAttrs: string[] = []
    for (const [key, value] of Object.entries(attributes)) {
      if (includesMatch(processors[toolName].params, key)) {
        params[key] = value
        continue
      }

      extraAttrs.push(key)
    }
    if (extraAttrs.length) {
      onError(
        toolName,
        `WARN: Ignoring extra parameters found in ${toolName} attributes: ${JSON.stringify(extraAttrs)}. Make sure to only use parameters defined in the tool!`
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
    attributes: Record<string, string>,
    rawTag: string
  ): State {
    if (state.currentParam !== null) {
      if (includesMatch(processors[state.currentTool].params, paramName)) {
        onError(
          state.currentTool,
          `WARN: Parameter found while parsing param ${state.currentParam} of ${state.currentTool}. Ignoring new parameter. Make sure to close all params and escape XML!`
        )
        onText({ contents: rawTag })
        return state
      } else if (paramName in processors) {
        onError(
          state.currentTool,
          `WARN: New tool started while parsing param ${state.currentParam} of ${state.currentTool}. Ending current tool. Make sure to close all tool calls params!`
        )
        return startTool(endTool(state), paramName, attributes)
      }
      onError(
        paramName,
        `WARN: Tool not found. Make sure to escape non-tool XML! e.g. &lt;${paramName}&gt;`
      )
      onText({ contents: rawTag })
      return state
    }

    if (paramName in processors) {
      onError(
        state.currentTool,
        `WARN: New tool started while parsing tool ${state.currentTool}. Ending current tool. Make sure to close all tool calls!`
      )
      return startTool(endTool(state), paramName, attributes)
    }

    if (!includesMatch(processors[state.currentTool].params, paramName)) {
      onError(
        paramName,
        `WARN: Tool not found. Make sure to escape non-tool XML! e.g. &lt;${paramName}&gt;`
      )
      onText({ contents: rawTag })
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
        `WARN: Found duplicate parameter value for ${state.currentParam} of ${state.currentTool}. Overwriting with newer value. Make sure to only have one value for each parameter!`
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
        `WARN: Found end of tool while parsing parameter ${state.currentParam}. Auto-closing parameter. Make sure to close all parameters!`
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

  function onTagopen(node: TagOpenNode) {
    const tagName = node.name
    const { attrs, errors } = Saxy.parseAttrs(node.attrs)
    for (const error of errors) {
      onError(tagName, error)
    }
    if (state.currentTool === null) {
      if (tagName in processors) {
        state = startTool(state, tagName, attrs)
        return
      }

      onError(
        tagName,
        'WARN: Ignoring non-tool XML tag. Make sure to escape non-tool XML!'
      )
      onText({ contents: node.rawTag })
      return
    }
    state = startParam(state, tagName, attrs, node.rawTag)
  }

  function onText(node: TextNode) {
    if (state.currentTool === null) {
      return
    }

    if (state.currentParam === null) {
      if (state.reportedStrayText) {
        return
      }
      if (node.contents.trim() === '') {
        return
      }
      onError(
        state.currentTool,
        `WARN: Ignoring text in ${state.currentTool} between parameters. Make sure to only put text within parameters!`
      )
      state.reportedStrayText = true
      return
    }

    state.paramContent += node.contents
  }

  function onTagclose(node: TagCloseNode) {
    const tagName = node.name

    if (tagName === state.currentParam) {
      state = endParam(state)
      return
    }

    if (tagName === state.currentTool) {
      state = endTool(state)
      return
    }

    onError(
      tagName,
      'WARN: Ignoring stray closing tag. Make sure to escape non-tool XML!'
    )
    onText({ contents: node.rawTag })
  }

  let state: State = {
    currentTool: null,
    currentParam: null,
    reportedStrayText: null,
    params: null,
    paramContent: null,
  }
  const parser = new Saxy()
  parser.on('tagopen', onTagopen)
  parser.on('text', onText)
  parser.on('tagclose', onTagclose)

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
      onError(
        state.currentParam,
        'WARN: Found end of stream while parsing parameter. End of parameter appended to response. Make sure to close all parameters!'
      )
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
