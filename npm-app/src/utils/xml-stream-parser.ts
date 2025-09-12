import {
  endsAgentStepParam,
  toolNameParam,
  toolXmlName,
} from '@codebuff/common/tools/constants'
import { getPartialJsonDelta } from '@codebuff/common/util/partial-json-delta'
import { Saxy } from '@codebuff/common/util/saxy'

import { defaultToolCallRenderer } from './tool-renderers'
import { MarkdownStreamRenderer } from '../display/markdown-renderer'

import type { ToolCallRenderer } from './tool-renderers'

// Track active renderer instances with reference counting
let activeRendererCount = 0

/**
 * Creates a transform stream that processes XML tool calls
 * @param renderer Custom renderer for tool calls or a map of renderers per tool
 * @param callback Optional callback function to receive processed chunks
 * @returns Transform stream
 */
export function createXMLStreamParser(
  renderer: Record<string, ToolCallRenderer>,
  callback?: (chunk: string) => void,
) {
  // Create parser with tool schema validation
  const parser = new Saxy({ [toolXmlName]: [] })

  let md: MarkdownStreamRenderer | null = null

  function ensureRenderer() {
    if (!md) {
      md = new MarkdownStreamRenderer({
        width: process.stdout.columns || 80,
        isTTY: process.stdout.isTTY,
        syntaxHighlight: true,
        streamingMode: 'smart', // Use smart content-aware streaming with loading indicators
      })
      activeRendererCount++
    }
    return md
  }

  function safeCleanup() {
    if (md) {
      try {
        md.cleanup()
      } catch (e) {
        // swallow errors to guarantee cleanup
      } finally {
        md = null
        activeRendererCount = Math.max(0, activeRendererCount - 1)
      }
    }
  }

  // Current state
  let inToolCallTag = false
  let currentTool: string | null = null
  let params: Record<string, string> = {}
  let completedParams: string[] = []
  let currentParam: string | null = null
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
    if (tag.name === toolXmlName) {
      inToolCallTag = true
    }
  })

  parser.on('text', (data) => {
    if (!data || typeof data.contents !== 'string') {
      return
    }
    if (!inToolCallTag) {
      const outs = ensureRenderer().write(data.contents)
      for (const out of outs) {
        parser.push(out)
        if (callback) callback(out)
      }
      return
    }

    const prevParamsContent = paramsContent
    paramsContent += data.contents
    const {
      delta,
      result,
      lastParam: { key: lastKey, complete: lastComplete },
    } = getPartialJsonDelta(paramsContent, prevParamsContent)
    if (
      lastKey === toolNameParam &&
      lastComplete &&
      delta[lastKey] === undefined
    ) {
      delta[lastKey] = ''
    }
    for (const [key, value] of Object.entries(delta)) {
      if (key === toolNameParam) {
        if (key === lastKey && !lastComplete) {
          continue
        }
        if (currentTool !== null) {
          continue
        }
        // start tool
        const toolRenderer = getRenderer(result[key])
        if (toolRenderer.onToolStart) {
          const output = toolRenderer.onToolStart(result[key], {})
          if (typeof output === 'string') {
            parser.push(output)
            if (callback) callback(output)
          } else if (output !== null) {
            output()
          }
        }
        currentTool = result[key]
        continue
      }

      // handle tool params
      const stringValue =
        value == null
          ? ''
          : typeof value === 'string'
            ? value
            : JSON.stringify(value) ?? ''
      if (key === endsAgentStepParam) {
        continue
      }
      const toolName = result[toolNameParam]
      if (currentParam !== null && currentParam !== key) {
        const toolRenderer = getRenderer(toolName)
        if (toolRenderer.onParamEnd) {
          const output = toolRenderer.onParamEnd(
            currentParam,
            toolName,
            result[currentParam] ?? '',
          )
          if (typeof output === 'string') {
            parser.push(output)
            if (callback) callback(output)
          } else if (output !== null) {
            output()
          }
        }
        completedParams.push(currentParam)
      }
      if (completedParams.includes(key)) {
        currentParam = null
        continue
      }
      currentParam = key
      const toolRenderer = getRenderer(toolName)
      if (params[key] === undefined) {
        if (toolRenderer.onParamStart) {
          const output = toolRenderer.onParamStart(key, toolName)
          if (typeof output === 'string') {
            parser.push(output)
            if (callback) callback(output)
          } else if (output !== null) {
            output()
          }
        }
      }
      if (toolRenderer.onParamChunk && stringValue !== '') {
        const output = toolRenderer.onParamChunk(stringValue, key, toolName)
        if (typeof output === 'string') {
          parser.push(output)
          if (callback) callback(output)
        } else if (output !== null) {
          output()
        }
      }
      if (key === lastKey && lastComplete) {
        const toolRenderer = getRenderer(toolName)
        if (toolRenderer.onParamEnd) {
          const output = toolRenderer.onParamEnd(
            key,
            toolName,
            result[key] == null
              ? ''
              : typeof result[key] === 'string'
                ? result[key]
                : JSON.stringify(result[key]) ?? '',
          )
          if (typeof output === 'string') {
            parser.push(output)
            if (callback) callback(output)
          } else if (output !== null) {
            output()
          }
        }
        completedParams.push(key)
        currentParam = null
      }
    }
    params = Object.fromEntries(
      Object.entries(result).map(([k, v]) => [
        k,
        v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v) ?? '',
      ]),
    )
  })

  parser.on('tagclose', (tag) => {
    if (!inToolCallTag) {
      return
    }
    const toolName = params[toolNameParam]
    const toolRenderer = getRenderer(toolName)

    if (currentParam !== null) {
      if (toolRenderer.onParamEnd) {
        const output = toolRenderer.onParamEnd(
          currentParam,
          toolName,
          params[currentParam] ?? '',
        )
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

    inToolCallTag = false
    paramsContent = ''
    params = {}
    currentParam = null
    currentTool = null
    completedParams = []
  })

  parser._flush = function (done: (error?: Error | null) => void) {
    if (md) {
      const rem = md.end()
      if (rem) {
        this.push(rem)
        if (callback) callback(rem)
      }
    }
    safeCleanup()
    done()
  }

  // Override destroy to ensure markdown renderer cleanup
  const originalDestroy = parser.destroy.bind(parser)
  parser.destroy = function (error?: Error) {
    safeCleanup()
    return originalDestroy(error)
  }

  return parser
}

export function getActiveRendererCount() {
  return activeRendererCount
}
