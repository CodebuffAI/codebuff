import { describe, test, expect } from 'bun:test'
import { cloneDeep } from 'lodash'
import { z } from 'zod/v4'

import { cloneDeepKeepingZod } from '../zod-safe-clone'

describe('lodash cloneDeep zod amputation (the bug)', () => {
  test('cloneDeep strips the zod engine, so the clone detonates on use', () => {
    const schema = z.object({ q: z.string() })
    const cloned = cloneDeep(schema)

    // zod v4 keeps its engine on a non-enumerable own property; lodash only
    // copies enumerable own properties, so the clone looks like a schema...
    expect(typeof cloned.safeParse).toBe('function')
    // ...but has no internals, and every zod internal that touches _zod dies:
    expect('_zod' in cloned).toBe(false)
    expect(() => z.toJSONSchema(cloned as never)).toThrow()
  })
})

describe('cloneDeepKeepingZod', () => {
  test('passes zod schemas through by reference, engine intact', () => {
    const schema = z.object({ q: z.string().describe('query') })
    const input = { cfg: schema, note: 'plain', nested: { arr: [1, 2] } }

    const out = cloneDeepKeepingZod(input)

    expect(out.note).toBe('plain')
    expect(out.nested).not.toBe(input.nested)
    expect(out.nested.arr).toEqual([1, 2])
    // Same live instance, so the engine survives:
    expect(out.cfg).toBe(schema)
    const jsonSchema = z.toJSONSchema(out.cfg)
    expect(jsonSchema.type).toBe('object')
    expect(jsonSchema.properties.q.type).toBe('string')
  })

  test('deep-clones plain structures exactly like cloneDeep', () => {
    const input = { a: { b: [1, { c: 'd' }] }, e: null }
    const out = cloneDeepKeepingZod(input)
    expect(out).toEqual(input)
    expect(out.a).not.toBe(input.a)
    expect(out.a.b[1]).not.toBe(input.a.b[1])
  })

  test('handles schemas nested inside collections', () => {
    const schema = z.object({ id: z.number() })
    const out = cloneDeepKeepingZod({ tools: [{ name: 'x', inputSchema: schema }] })
    expect(out.tools[0].inputSchema).toBe(schema)
    expect(() => z.toJSONSchema(out.tools[0].inputSchema)).not.toThrow()
  })
})
