import { describe, test, expect } from 'bun:test'
import { z } from 'zod/v4'

import { toTokenCountInputSchema } from '../to-json-schema'

describe('toTokenCountInputSchema', () => {
  test('converts a zod schema to JSON Schema with a top-level type', () => {
    const schema = z.object({
      q: z.string().describe('query'),
      n: z.number().optional(),
    })
    const out = toTokenCountInputSchema(schema) as Record<string, any> | undefined
    expect(out?.type).toBe('object')
    expect(out?.properties.q.type).toBe('string')
  })

  test('backfills type:object for union schemas (anyOf)', () => {
    const schema = z.union([z.object({ a: z.string() }), z.object({ b: z.number() })])
    const out = toTokenCountInputSchema(schema) as Record<string, any> | undefined
    // Anthropic's count_tokens rejects a schema with no top-level type
    expect(out?.type).toBe('object')
    expect(out?.anyOf).toBeDefined()
  })

  test('copies an already-plain JSON Schema object as-is', () => {
    const jsonSchema = {
      type: 'object',
      properties: { location: { type: 'string', enum: ['NYC', 'LA'] } },
      required: ['location'],
    }
    const out = toTokenCountInputSchema(jsonSchema)
    expect(out).toEqual(jsonSchema)
  })

  test('drops $schema and survives nullish input', () => {
    expect(toTokenCountInputSchema(undefined)).toBeUndefined()
    expect(toTokenCountInputSchema(null)).toBeUndefined()
    const out = toTokenCountInputSchema({ $schema: 'https://json-schema.org/x', type: 'object' })
    expect(out?.$schema).toBeUndefined()
    expect(out?.type).toBe('object')
  })
})
