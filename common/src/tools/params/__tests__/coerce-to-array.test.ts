import { describe, expect, it } from 'bun:test'
import z from 'zod/v4'

import { coerceToArray, normalizeReplacementAliases } from '../utils'

describe('coerceToArray', () => {
  it('passes through arrays unchanged', () => {
    expect(coerceToArray(['a', 'b'])).toEqual(['a', 'b'])
    expect(coerceToArray([{ old: 'x', new: 'y' }])).toEqual([
      { old: 'x', new: 'y' },
    ])
    expect(coerceToArray([])).toEqual([])
  })

  it('wraps a single string in an array', () => {
    expect(coerceToArray('file.ts')).toEqual(['file.ts'])
  })

  it('wraps a single object in an array', () => {
    expect(coerceToArray({ old: 'x', new: 'y' })).toEqual([
      { old: 'x', new: 'y' },
    ])
  })

  it('wraps a single number in an array', () => {
    expect(coerceToArray(42)).toEqual([42])
  })

  it('parses a stringified JSON array', () => {
    expect(coerceToArray('["file1.ts", "file2.ts"]')).toEqual([
      'file1.ts',
      'file2.ts',
    ])
  })

  it('wraps a non-JSON string (does not parse as array)', () => {
    expect(coerceToArray('not-json')).toEqual(['not-json'])
  })

  it('wraps a stringified JSON object (not an array) in an array', () => {
    expect(coerceToArray('{"key": "value"}')).toEqual(['{"key": "value"}'])
  })

  it('passes through null', () => {
    expect(coerceToArray(null)).toBeNull()
  })

  it('passes through undefined', () => {
    expect(coerceToArray(undefined)).toBeUndefined()
  })
})

describe('coerceToArray with Zod schemas', () => {
  it('coerces a single string into an array for z.array(z.string())', () => {
    const schema = z.object({
      paths: z.preprocess(coerceToArray, z.array(z.string())),
    })
    const result = schema.safeParse({ paths: 'file.ts' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.paths).toEqual(['file.ts'])
    }
  })

  it('coerces a single object into an array for z.array(z.object(...))', () => {
    const schema = z.object({
      replacements: z.preprocess(
        coerceToArray,
        z.array(z.object({ old: z.string(), new: z.string() })),
      ),
    })
    const result = schema.safeParse({ replacements: { old: 'x', new: 'y' } })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.replacements).toEqual([{ old: 'x', new: 'y' }])
    }
  })

  it('still validates correctly when already an array', () => {
    const schema = z.object({
      paths: z.preprocess(coerceToArray, z.array(z.string())),
    })
    const result = schema.safeParse({ paths: ['a.ts', 'b.ts'] })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.paths).toEqual(['a.ts', 'b.ts'])
    }
  })

  it('still rejects invalid inner types after coercion', () => {
    const schema = z.object({
      paths: z.preprocess(coerceToArray, z.array(z.string())),
    })
    const result = schema.safeParse({ paths: 123 })
    expect(result.success).toBe(false)
  })

  it('works with optional arrays', () => {
    const schema = z.object({
      paths: z.preprocess(coerceToArray, z.array(z.string())).optional(),
    })
    const withValue = schema.safeParse({ paths: 'file.ts' })
    expect(withValue.success).toBe(true)
    if (withValue.success) {
      expect(withValue.data.paths).toEqual(['file.ts'])
    }

    const withoutValue = schema.safeParse({})
    expect(withoutValue.success).toBe(true)
    if (withoutValue.success) {
      expect(withoutValue.data.paths).toBeUndefined()
    }
  })

  it('produces identical JSON schema with or without preprocess', () => {
    const plain = z.object({ paths: z.array(z.string()) })
    const coerced = z.object({
      paths: z.preprocess(coerceToArray, z.array(z.string())),
    })

    const plainSchema = z.toJSONSchema(plain, { io: 'input' })
    const coercedSchema = z.toJSONSchema(coerced, { io: 'input' })
    expect(coercedSchema).toEqual(plainSchema)
  })
})

describe('normalizeReplacementAliases', () => {
  it('maps old_str and new_str onto the documented replacement keys', () => {
    expect(
      normalizeReplacementAliases({
        old_str: 'before',
        new_str: 'after',
        allowMultiple: true,
      }),
    ).toEqual({
      old_str: 'before',
      new_str: 'after',
      oldString: 'before',
      newString: 'after',
      allowMultiple: true,
    })
  })

  it('maps old_string and new_string onto the documented replacement keys', () => {
    expect(
      normalizeReplacementAliases({
        old_string: 'before',
        new_string: 'after',
      }),
    ).toEqual({
      old_string: 'before',
      new_string: 'after',
      oldString: 'before',
      newString: 'after',
    })
  })

  it('does not overwrite documented replacement keys', () => {
    expect(
      normalizeReplacementAliases({
        oldString: 'before',
        newString: 'after',
        old_str: 'ignored',
        new_str: 'ignored',
      }),
    ).toEqual({
      oldString: 'before',
      newString: 'after',
      old_str: 'ignored',
      new_str: 'ignored',
    })
  })
})
