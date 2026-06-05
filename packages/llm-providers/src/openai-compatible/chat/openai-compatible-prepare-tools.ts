import { UnsupportedFunctionalityError } from '@ai-sdk/provider'

import type {
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
} from '@ai-sdk/provider'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function decodeJsonPointerSegment(segment: string) {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~')
}

function lookupJsonPointer(root: unknown, pointer: string) {
  if (!pointer.startsWith('#/')) return undefined

  let current = root
  for (const segment of pointer.slice(2).split('/').map(decodeJsonPointerSegment)) {
    if (!isRecord(current) && !Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function inlineLocalSchemaRefs(schema: unknown): unknown {
  const root = isRecord(schema) && 'jsonSchema' in schema ? schema.jsonSchema : schema

  const visit = (value: unknown, refStack: Set<string>): unknown => {
    if (Array.isArray(value)) {
      return value.map((item) => visit(item, refStack))
    }

    if (!isRecord(value)) return value

    const ref = typeof value.$ref === 'string' ? value.$ref : undefined
    if (ref?.startsWith('#/')) {
      if (refStack.has(ref)) return {}

      const target = lookupJsonPointer(root, ref)
      const siblings = { ...value }
      delete siblings.$ref

      if (target !== undefined) {
        const nextRefStack = new Set(refStack)
        nextRefStack.add(ref)
        const resolved = visit(target, nextRefStack)
        if (isRecord(resolved) && Object.keys(siblings).length > 0) {
          return visit({ ...resolved, ...siblings }, refStack)
        }
        return resolved
      }

      if (Object.keys(siblings).length === 0) return {}
      return visit(siblings, refStack)
    }

    const result: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (key === '$defs' || key === 'definitions') continue
      result[key] = visit(child, refStack)
    }
    return result
  }

  return visit(root, new Set())
}

export function prepareTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV2CallOptions['tools']
  toolChoice?: LanguageModelV2CallOptions['toolChoice']
}): {
  tools:
    | undefined
    | Array<{
        type: 'function'
        function: {
          name: string
          description: string | undefined
          parameters: unknown
        }
      }>
  toolChoice:
    | { type: 'function'; function: { name: string } }
    | 'auto'
    | 'none'
    | 'required'
    | undefined
  toolWarnings: LanguageModelV2CallWarning[]
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined

  const toolWarnings: LanguageModelV2CallWarning[] = []

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings }
  }

  const openaiCompatTools: Array<{
    type: 'function'
    function: {
      name: string
      description: string | undefined
      parameters: unknown
    }
  }> = []

  for (const tool of tools) {
    if (tool.type === 'provider-defined') {
      toolWarnings.push({ type: 'unsupported-tool', tool })
    } else {
      openaiCompatTools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: inlineLocalSchemaRefs(tool.inputSchema),
        },
      })
    }
  }

  if (toolChoice == null) {
    return { tools: openaiCompatTools, toolChoice: undefined, toolWarnings }
  }

  const type = toolChoice.type

  switch (type) {
    case 'auto':
    case 'none':
    case 'required':
      return { tools: openaiCompatTools, toolChoice: type, toolWarnings }
    case 'tool':
      return {
        tools: openaiCompatTools,
        toolChoice: {
          type: 'function',
          function: { name: toolChoice.toolName },
        },
        toolWarnings,
      }
    default: {
      const _exhaustiveCheck: never = type
      throw new UnsupportedFunctionalityError({
        functionality: `tool choice type: ${_exhaustiveCheck}`,
      })
    }
  }
}
