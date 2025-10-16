import { toolXmlName } from '../../common/src/tools/constants'

export type ToolXmlFilterState = {
  buffer: string
  activeTag: 'tool_call' | 'tool_result' | null
}

const TOOL_XML_OPEN = `<${toolXmlName}>`
const TOOL_XML_CLOSE = `</${toolXmlName}>`
const TOOL_XML_PREFIX = `<${toolXmlName}`
const TOOL_RESULT_OPEN = '<tool_result>'
const TOOL_RESULT_CLOSE = '</tool_result>'
const TOOL_RESULT_PREFIX = '<tool_result'

const TAG_DEFINITIONS = [
  {
    type: 'tool_call' as const,
    open: TOOL_XML_OPEN,
    close: TOOL_XML_CLOSE,
    prefix: TOOL_XML_PREFIX,
  },
  {
    type: 'tool_result' as const,
    open: TOOL_RESULT_OPEN,
    close: TOOL_RESULT_CLOSE,
    prefix: TOOL_RESULT_PREFIX,
  },
]

const TAG_INFO_BY_TYPE = Object.fromEntries(
  TAG_DEFINITIONS.map((tag) => [tag.type, tag]),
)

const getPartialStartIndex = (value: string, pattern: string): number => {
  const max = Math.min(pattern.length - 1, value.length)
  for (let len = max; len > 0; len--) {
    const slice = value.slice(value.length - len)
    if (pattern.startsWith(slice)) {
      return value.length - len
    }
  }
  return -1
}

export function createToolXmlFilterState(): ToolXmlFilterState {
  return { buffer: '', activeTag: null }
}

export function filterToolXmlFromText(
  state: ToolXmlFilterState,
  incoming: string,
  maxBuffer: number,
): { text: string } {
  if (incoming) {
    state.buffer += incoming
  }

  let sanitized = ''

  while (state.buffer.length > 0) {
    if (state.activeTag == null) {
      let nextTag: {
        index: number
        definition: (typeof TAG_DEFINITIONS)[number]
      } | null = null

      for (const definition of TAG_DEFINITIONS) {
        const index = state.buffer.indexOf(definition.open)
        if (index !== -1) {
          if (nextTag == null || index < nextTag.index) {
            nextTag = { index, definition }
          }
        }
      }

      if (!nextTag) {
        let partialIndex = -1
        for (const definition of TAG_DEFINITIONS) {
          const idx = getPartialStartIndex(state.buffer, definition.prefix)
          if (idx !== -1 && (partialIndex === -1 || idx < partialIndex)) {
            partialIndex = idx
          }
        }

        if (partialIndex === -1) {
          sanitized += state.buffer
          state.buffer = ''
        } else {
          sanitized += state.buffer.slice(0, partialIndex)
          state.buffer = state.buffer.slice(partialIndex)
        }
        break
      }

      sanitized += state.buffer.slice(0, nextTag.index)
      state.buffer = state.buffer.slice(
        nextTag.index + nextTag.definition.open.length,
      )
      state.activeTag = nextTag.definition.type
    } else {
      const definition = TAG_INFO_BY_TYPE[state.activeTag]
      const closeIndex = state.buffer.indexOf(definition.close)

      if (closeIndex === -1) {
        const partialCloseIndex = getPartialStartIndex(
          state.buffer,
          definition.close,
        )
        if (partialCloseIndex === -1) {
          const keepLength = definition.close.length - 1
          if (state.buffer.length > keepLength) {
            state.buffer = state.buffer.slice(
              state.buffer.length - keepLength,
            )
          }
        } else {
          state.buffer = state.buffer.slice(partialCloseIndex)
        }

        if (state.buffer.length > maxBuffer) {
          state.buffer = state.buffer.slice(-maxBuffer)
        }
        break
      }

      state.buffer = state.buffer.slice(
        closeIndex + definition.close.length,
      )
      state.activeTag = null
    }
  }

  if (state.buffer.length > maxBuffer) {
    state.buffer = state.buffer.slice(-maxBuffer)
  }

  return { text: sanitized }
}
