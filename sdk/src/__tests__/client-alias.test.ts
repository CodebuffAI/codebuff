import { describe, expect, test } from 'bun:test'

import { OpenbuffClient, CodebuffClient } from '../client'

describe('Client export alias compatibility', () => {
  test('OpenbuffClient and CodebuffClient are the same class (identity)', () => {
    expect(OpenbuffClient).toBe(CodebuffClient)
  })

  test('both names are constructable functions', () => {
    expect(typeof OpenbuffClient).toBe('function')
    expect(typeof CodebuffClient).toBe('function')
  })

  test('instances from either name are instanceof both names', () => {
    const fromPrimary = new OpenbuffClient({})
    const fromAlias = new CodebuffClient({})

    expect(fromPrimary).toBeInstanceOf(OpenbuffClient)
    expect(fromPrimary).toBeInstanceOf(CodebuffClient)
    expect(fromAlias).toBeInstanceOf(OpenbuffClient)
    expect(fromAlias).toBeInstanceOf(CodebuffClient)
  })
})
