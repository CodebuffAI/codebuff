import {
  endsAgentStepParam,
  toolNameParam,
  toolXmlName,
} from '@codebuff/common/constants/tools'
import { Saxy } from '@codebuff/common/util/saxy'

import { Spinner } from './spinner'
import { defaultToolCallRenderer, ToolCallRenderer } from './tool-renderers'

/**
 * Creates a transform stream that processes XML tool calls
 * @param renderer Custom renderer for tool calls or a map of renderers per tool
 * @param callback Optional callback function to receive processed chunks
 * @returns Transform stream
 */
export function createXMLStreamParser(
  renderer: Record<string, ToolCallRenderer>,
  callback?: (chunk: string) => void
) {
  // Create parser with tool schema validation
  const parser = new Saxy({ [toolXmlName]: [] })

  // Current state
  let currentTool = false
  let params: Record<string, string> = {}
  let paramsContent = ''

  // Helper to get the appropriate renderer for the current tool
  const getRenderer = (toolName: string): ToolCallRenderer => {
    if (!renderer) return defaultToolCallRenderer

    // If renderer is a map of tool-specific renderers
    if (typeof renderer === 'object' && !('onToolStart' in renderer)) {
      return (
        (renderer as Record<string, ToolCallRenderer>)[toolName] ||
        defaultToolCallRenderer
      )
    }

    // If renderer is a single renderer
    return renderer as ToolCallRenderer
  }

  // Set up event handlers
  parser.on('tagopen', (tag) => {
    currentTool = true
    Spinner.get().start('Using tool...')
  })

  parser.on('text', (data) => {
    if (currentTool) {
      paramsContent += data.contents
    } else {
      // Text outside of tool tags
      parser.push(data.contents)
      if (callback) callback(data.contents)
    }
  })

  parser.on('tagclose', (tag) => {
    if (!currentTool) {
      return
    }

    let params: any
    try {
      params = JSON.parse(paramsContent)
    } catch (error: any) {
      // do nothing
    }

    const toolName = params[toolNameParam] as string
    delete params[toolNameParam]
    delete params[endsAgentStepParam]

    // Call renderer if available
    const toolRenderer = getRenderer(toolName)
    if (toolRenderer.onToolStart) {
      const output = toolRenderer.onToolStart(toolName, {})
      if (typeof output === 'string') {
        parser.push(output)
        if (callback) callback(output)
      } else if (output !== null) {
        output()
      }
    }
    for (const [key, value] of Object.entries(params)) {
      const stringValue =
        typeof value === 'string' ? value : JSON.stringify(value)
      if (toolRenderer.onParamStart) {
        const output = toolRenderer.onParamStart(key, stringValue)
        if (typeof output === 'string') {
          parser.push(output)
          if (callback) callback(output)
        } else if (output !== null) {
          output()
        }
      }
      if (toolRenderer.onParamChunk) {
        const output = toolRenderer.onParamChunk(stringValue, key, toolName)
        if (typeof output === 'string') {
          parser.push(output)
          if (callback) callback(output)
        } else if (output !== null) {
          output()
        }
      }
      if (toolRenderer.onParamEnd) {
        const output = toolRenderer.onParamEnd(key, toolName, stringValue)
        if (typeof output === 'string') {
          parser.push(output)
          if (callback) callback(output)
        } else if (output !== null) {
          output()
        }
      }
    }
    if (toolRenderer.onToolEnd) {
      const output = toolRenderer.onToolEnd(toolName, params)
      if (typeof output === 'string') {
        parser.push(output)
        if (callback) callback(output)
      } else if (output !== null) {
        output()
      }
    }

    currentTool = false
    paramsContent = ''
  })

  parser.on('end', () => {
    parser.end()
  })

  return parser
}
