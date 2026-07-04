import { describe, expect, it } from 'bun:test'
import z from 'zod/v4'

import { toTokenCountInputSchema } from '../run-agent-step'

describe('toTokenCountInputSchema', () => {
  it('converts a Zod object schema to JSON Schema with a top-level type', () => {
    const schema = z.object({ paths: z.array(z.string()) })

    const result = toTokenCountInputSchema(schema)

    expect(result).toEqual({
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' } },
      },
      required: ['paths'],
    })
    // Zod internals (`def`/`shape`) must not leak into the payload.
    expect(result).not.toHaveProperty('def')
    expect(result).not.toHaveProperty('$schema')
  })

  it("backfills type: 'object' for a Zod union schema (anyOf, no top-level type)", () => {
    const schema = z.union([
      z.object({ a: z.string() }),
      z.object({ b: z.number() }),
    ])

    const result = toTokenCountInputSchema(schema)!

    // A union serializes to `anyOf` with no top-level type; Anthropic rejects
    // that, so we backfill `type: 'object'`.
    expect(result.type).toBe('object')
    expect(result).toHaveProperty('anyOf')
  })

  it("backfills type: 'object' for a plain JSON Schema object missing type", () => {
    const schema = {
      properties: { path: { type: 'string' } },
      required: ['path'],
    }

    const result = toTokenCountInputSchema(schema)

    expect(result).toEqual({
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    })
  })

  it('leaves an existing top-level type untouched', () => {
    const schema = { type: 'object', properties: { q: { type: 'string' } } }

    const result = toTokenCountInputSchema(schema)

    expect(result).toEqual(schema)
    // Returns a copy, not the same reference.
    expect(result).not.toBe(schema)
  })

  it('backfills a null or empty-string top-level type on a plain object', () => {
    expect(toTokenCountInputSchema({ type: null, properties: {} })).toEqual({
      type: 'object',
      properties: {},
    })
    expect(toTokenCountInputSchema({ type: '', properties: {} })).toEqual({
      type: 'object',
      properties: {},
    })
  })

  it('returns undefined for null/undefined input', () => {
    expect(toTokenCountInputSchema(null)).toBeUndefined()
    expect(toTokenCountInputSchema(undefined)).toBeUndefined()
  })
})
