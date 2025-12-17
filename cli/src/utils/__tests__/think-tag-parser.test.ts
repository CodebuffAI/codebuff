import { describe, test, expect } from 'bun:test'

import {
  parseThinkTags,
  getPartialTagLength,
  THINK_OPEN_TAG,
  THINK_CLOSE_TAG,
} from '../think-tag-parser'

describe('parseThinkTags', () => {
  test('returns empty array for empty string', () => {
    expect(parseThinkTags('')).toEqual([])
  })

  test('returns single text segment for text without tags', () => {
    expect(parseThinkTags('Hello world')).toEqual([
      { type: 'text', content: 'Hello world' },
    ])
  })

  test('parses single think tag', () => {
    expect(parseThinkTags('<think>My thoughts</think>')).toEqual([
      { type: 'thinking', content: 'My thoughts' },
    ])
  })

  test('parses think tag with surrounding text', () => {
    expect(parseThinkTags('Before <think>thinking</think> after')).toEqual([
      { type: 'text', content: 'Before ' },
      { type: 'thinking', content: 'thinking' },
      { type: 'text', content: ' after' },
    ])
  })

  test('parses multiple think tags', () => {
    expect(
      parseThinkTags(
        'Start <think>first</think> middle <think>second</think> end',
      ),
    ).toEqual([
      { type: 'text', content: 'Start ' },
      { type: 'thinking', content: 'first' },
      { type: 'text', content: ' middle ' },
      { type: 'thinking', content: 'second' },
      { type: 'text', content: ' end' },
    ])
  })

  test('handles unclosed think tag at end', () => {
    expect(parseThinkTags('Before <think>unclosed thinking')).toEqual([
      { type: 'text', content: 'Before ' },
      { type: 'thinking', content: 'unclosed thinking' },
    ])
  })

  test('handles think tag at start', () => {
    expect(parseThinkTags('<think>thoughts</think> after')).toEqual([
      { type: 'thinking', content: 'thoughts' },
      { type: 'text', content: ' after' },
    ])
  })

  test('handles think tag at end', () => {
    expect(parseThinkTags('before <think>thoughts</think>')).toEqual([
      { type: 'text', content: 'before ' },
      { type: 'thinking', content: 'thoughts' },
    ])
  })

  test('handles empty think tag', () => {
    expect(parseThinkTags('before <think></think> after')).toEqual([
      { type: 'text', content: 'before ' },
      { type: 'text', content: ' after' },
    ])
  })

  test('handles multiline content in think tag', () => {
    const input = 'Before\n<think>Line 1\nLine 2\nLine 3</think>\nAfter'
    expect(parseThinkTags(input)).toEqual([
      { type: 'text', content: 'Before\n' },
      { type: 'thinking', content: 'Line 1\nLine 2\nLine 3' },
      { type: 'text', content: '\nAfter' },
    ])
  })

  test('handles consecutive think tags', () => {
    expect(parseThinkTags('<think>first</think><think>second</think>')).toEqual(
      [
        { type: 'thinking', content: 'first' },
        { type: 'thinking', content: 'second' },
      ],
    )
  })

  test('preserves whitespace inside think tags', () => {
    expect(parseThinkTags('<think>  spaced content  </think>')).toEqual([
      { type: 'thinking', content: '  spaced content  ' },
    ])
  })

  test('handles only opening tag', () => {
    expect(parseThinkTags('<think>started thinking')).toEqual([
      { type: 'thinking', content: 'started thinking' },
    ])
  })
})

describe('getPartialTagLength', () => {
  test('returns 0 for text without partial tags', () => {
    expect(getPartialTagLength('hello world')).toBe(0)
    expect(getPartialTagLength('some text')).toBe(0)
    expect(getPartialTagLength('')).toBe(0)
  })

  test('detects partial opening tag prefixes', () => {
    expect(getPartialTagLength('text<')).toBe(1)
    expect(getPartialTagLength('text<t')).toBe(2)
    expect(getPartialTagLength('text<th')).toBe(3)
    expect(getPartialTagLength('text<thi')).toBe(4)
    expect(getPartialTagLength('text<thin')).toBe(5)
    expect(getPartialTagLength('text<think')).toBe(6)
  })

  test('detects partial closing tag prefixes', () => {
    expect(getPartialTagLength('text</')).toBe(2)
    expect(getPartialTagLength('text</t')).toBe(3)
    expect(getPartialTagLength('text</th')).toBe(4)
    expect(getPartialTagLength('text</thi')).toBe(5)
    expect(getPartialTagLength('text</thin')).toBe(6)
    expect(getPartialTagLength('text</think')).toBe(7)
  })

  test('returns 0 for complete tags', () => {
    expect(getPartialTagLength('text<think>')).toBe(0)
    expect(getPartialTagLength('text</think>')).toBe(0)
  })

  test('returns 0 for non-tag < character', () => {
    expect(getPartialTagLength('text<x')).toBe(0)
    expect(getPartialTagLength('text<a')).toBe(0)
    expect(getPartialTagLength('text</x')).toBe(0)
  })

  test('handles just the partial tag character', () => {
    expect(getPartialTagLength('<')).toBe(1)
    expect(getPartialTagLength('<t')).toBe(2)
    expect(getPartialTagLength('</')).toBe(2)
  })
})

describe('tag constants', () => {
  test('THINK_OPEN_TAG is correct', () => {
    expect(THINK_OPEN_TAG).toBe('<think>')
  })

  test('THINK_CLOSE_TAG is correct', () => {
    expect(THINK_CLOSE_TAG).toBe('</think>')
  })
})
