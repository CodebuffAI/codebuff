import type {
  ChatCompletionRequestBody,
  ChatCompletionTool,
} from './types'

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

export function inlineLocalSchemaRefs(schema: unknown): unknown {
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
      if (key === '$schema' || key === '$defs' || key === 'definitions') continue
      result[key] = visit(child, refStack)
    }
    return result
  }

  return visit(root, new Set())
}

function normalizeToolSchema(tool: ChatCompletionTool): ChatCompletionTool {
  if (!tool.function || tool.function.parameters === undefined) {
    return tool
  }

  return {
    ...tool,
    function: {
      ...tool.function,
      parameters: inlineLocalSchemaRefs(tool.function.parameters),
    },
  }
}

export function normalizeToolSchemas(
  body: ChatCompletionRequestBody,
): ChatCompletionRequestBody {
  if (!body.tools?.length) return body

  return {
    ...body,
    tools: body.tools.map(normalizeToolSchema),
  }
}
