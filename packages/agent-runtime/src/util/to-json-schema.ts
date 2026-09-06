import z from 'zod/v4'

// Convert a tool's stored inputSchema into plain JSON Schema. Built-in and MCP
// tools convert from a Zod schema; plain objects (e.g. a pre-serialized JSON
// Schema) are copied. Serializing a Zod schema raw would ship Zod internals
// (`def`/`shape`, non-enumerable `_zod`) instead of JSON Schema — which breaks
// JSON.stringify (zod schemas are cyclic) and makes token counts computed
// against garbage. Any schema whose top-level isn't an object (e.g. a union →
// `anyOf`) is backfilled with `type: 'object'`, which Anthropic requires.
export function toTokenCountInputSchema(
  inputSchema: unknown,
): Record<string, unknown> | undefined {
  if (inputSchema == null) return undefined

  let jsonSchema: Record<string, unknown>
  // AI SDK Schema objects (served by getToolSet for raw JSON Schema inputs,
  // e.g. loose MCP schemas) already carry the model-facing JSON Schema —
  // use it directly. Converting it through zod again would count tokens
  // against a lossy round-tripped copy instead of the real schema.
  const asSchema = inputSchema as { jsonSchema?: unknown; validate?: unknown }
  if (
    typeof asSchema.validate === 'function' &&
    asSchema.jsonSchema != null &&
    typeof asSchema.jsonSchema === 'object'
  ) {
    jsonSchema = {
      ...(asSchema.jsonSchema as Record<string, unknown>),
    }
  } else if (
    typeof (inputSchema as { safeParse?: unknown }).safeParse === 'function'
  ) {
    try {
      jsonSchema = z.toJSONSchema(inputSchema as z.ZodType, {
        io: 'input',
      }) as Record<string, unknown>
    } catch {
      jsonSchema = { type: 'object', properties: {} }
    }
  } else if (typeof inputSchema === 'object' && !Array.isArray(inputSchema)) {
    // Already a plain object (e.g. a pre-serialized JSON Schema) — copy it.
    jsonSchema = { ...(inputSchema as Record<string, unknown>) }
  } else {
    return undefined
  }

  // `$schema` is meaningless to count_tokens; drop it to keep the payload lean.
  delete jsonSchema['$schema']
  // Anthropic requires a top-level `type: 'object'`. Object schemas already
  // carry it; union/intersection schemas (anyOf/allOf) don't — backfill it.
  // Treat missing / null / empty-string as absent (valid JSON Schema `type` is
  // always a non-empty string or array).
  if (jsonSchema.type == null || jsonSchema.type === '') {
    jsonSchema.type = 'object'
  }
  return jsonSchema
}
