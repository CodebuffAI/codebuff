import { describe, expect, test } from 'bun:test'

import { appendTextToRootStream } from '../block-operations'

import type { ContentBlock, TextContentBlock } from '../../types/chat'

/**
 * The text stream path only scans the seam between the last block and the new
 * delta when looking for a partial think tag (see block-operations.ts), so it
 * must still notice a tag split at any point inside the tag syntax, including
 * the widest partial prefix it has to recognise (`</think`).
 */

const stream = (text: string, chunkSize: number): ContentBlock[] => {
  let blocks: ContentBlock[] = []
  for (let i = 0; i < text.length; i += chunkSize) {
    blocks = appendTextToRootStream(blocks, {
      type: 'text',
      text: text.slice(i, i + chunkSize),
    })
  }
  return blocks
}

const shape = (blocks: ContentBlock[]) =>
  blocks.map((block) => {
    const text = block as TextContentBlock
    return {
      type: block.type,
      textType: text.textType,
      content: text.content,
      thinkingOpen: text.thinkingOpen,
    }
  })

const textOf = (blocks: ContentBlock[]) =>
  blocks.map((block) => (block as TextContentBlock).content ?? '').join('')

describe('think tags split across delta boundaries', () => {
  test('opening tag split across two deltas opens a thinking block', () => {
    const first = appendTextToRootStream(
      [{ type: 'text', content: 'a', textType: 'text' }],
      { type: 'text', text: ' <thi' },
    )
    const second = appendTextToRootStream(first, { type: 'text', text: 'nk>b' })

    expect(shape(second)).toEqual([
      { type: 'text', textType: 'text', content: 'a ', thinkingOpen: undefined },
      { type: 'text', textType: 'reasoning', content: 'b', thinkingOpen: true },
    ])
  })

  test('closing tag split across two deltas closes the thinking block', () => {
    const first = appendTextToRootStream([], {
      type: 'text',
      text: '<think>a</thi',
    })
    const second = appendTextToRootStream(first, { type: 'text', text: 'nk> b' })

    expect(shape(second)).toEqual([
      { type: 'text', textType: 'reasoning', content: 'a', thinkingOpen: false },
      { type: 'text', textType: 'text', content: ' b', thinkingOpen: undefined },
    ])
  })

  test('an empty think pair produces no blocks, however it is chunked', () => {
    for (const chunkSize of [1, 2, 7, 8, 100]) {
      expect(stream('<think></think>', chunkSize)).toEqual([])
    }
  })

  test('the widest partial close prefix is still recognised', () => {
    // `</think` is exactly the seam width; the `>` arrives on its own.
    const first = appendTextToRootStream([], {
      type: 'text',
      text: '<think>thought</think',
    })
    const second = appendTextToRootStream(first, { type: 'text', text: '>' })

    expect(shape(second)).toEqual([
      {
        type: 'text',
        textType: 'reasoning',
        content: 'thought',
        thinkingOpen: false,
      },
    ])
  })

  test('ordinary less-than at the end of a delta is kept as text', () => {
    const first = appendTextToRootStream([], { type: 'text', text: 'a <' })
    const second = appendTextToRootStream(first, { type: 'text', text: ' b' })

    expect(shape(second)).toEqual([
      {
        type: 'text',
        textType: 'text',
        content: 'a < b',
        thinkingOpen: undefined,
      },
    ])
  })
})

describe('long streams stay a single block', () => {
  test('5000 characters without tags accumulate into one block', () => {
    const text = 'abcdefghij'.repeat(500)
    const blocks = stream(text, 7)

    expect(blocks).toHaveLength(1)
    expect((blocks[0] as TextContentBlock).content).toBe(text)
  })

  test('a tag completed after a long prefix is still split out', () => {
    const prefix = 'x'.repeat(10_000)
    const blocks = stream(`${prefix}<think>thought</think>tail`, 64)

    // The prefix must stay intact and keep its length: no truncation at the seam.
    expect(textOf(blocks)).toBe(`${prefix}thoughttail`)
    expect(blocks.some((b) => (b as TextContentBlock).textType === 'reasoning'))
      .toBe(true)
  })

  test('a large block with a less-than keeps every character', () => {
    const text = `${'y'.repeat(10_000)} < not a tag`
    const blocks = stream(text, 33)

    expect(textOf(blocks)).toBe(text)
  })
})
