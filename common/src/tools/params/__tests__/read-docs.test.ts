import { describe, expect, test } from 'bun:test'

import { readDocsParams } from '../tool/read-docs'

describe('read_docs parameters', () => {
  test('trims text inputs and defaults max_tokens', () => {
    const result = readDocsParams.inputSchema.parse({
      libraryTitle: '  React  ',
      topic: '  hooks  ',
    })

    expect(result).toEqual({
      libraryTitle: 'React',
      topic: 'hooks',
      max_tokens: 10_000,
    })
  })

  test('rejects empty text and invalid token counts', () => {
    expect(
      readDocsParams.inputSchema.safeParse({
        libraryTitle: '   ',
        topic: 'hooks',
      }).success,
    ).toBe(false)
    expect(
      readDocsParams.inputSchema.safeParse({
        libraryTitle: 'React',
        topic: '   ',
      }).success,
    ).toBe(false)
    expect(
      readDocsParams.inputSchema.safeParse({
        libraryTitle: 'React',
        topic: 'hooks',
        max_tokens: -1,
      }).success,
    ).toBe(false)
    expect(
      readDocsParams.inputSchema.safeParse({
        libraryTitle: 'React',
        topic: 'hooks',
        max_tokens: 1.5,
      }).success,
    ).toBe(false)
  })
})
