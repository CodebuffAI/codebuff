import { describe, expect, test } from 'bun:test'

import {
  createToolXmlFilterState,
  filterToolXmlFromText,
} from '../tool-xml-filter'

const MAX_BUFFER = 1024

describe('filterToolXmlFromText', () => {
  test('removes inline tool_call segments from a single chunk', () => {
    const state = createToolXmlFilterState()
    const { text } = filterToolXmlFromText(
      state,
      'prefix <codebuff_tool_call>{"foo":1}</codebuff_tool_call> suffix',
      MAX_BUFFER,
    )
    expect(text).toBe('prefix  suffix')
  })

  test('removes tool_call content split across chunks', () => {
    const state = createToolXmlFilterState()
    const first = filterToolXmlFromText(
      state,
      'Hello <codebuff_tool_call>{"foo"',
      MAX_BUFFER,
    )
    expect(first.text).toBe('Hello ')

    const second = filterToolXmlFromText(
      state,
      '":"bar"}</codebuff_tool_call> world',
      MAX_BUFFER,
    )
    expect(second.text).toBe(' world')
  })

  test('removes tool_result content split across chunks', () => {
    const state = createToolXmlFilterState()
    const initial = filterToolXmlFromText(
      state,
      '<tool_result>{"output":"val"',
      MAX_BUFFER,
    )
    expect(initial.text).toBe('')

    const next = filterToolXmlFromText(
      state,
      'ue"}</tool_result>Tail',
      MAX_BUFFER,
    )
    expect(next.text).toBe('Tail')
  })

  test('trims internal buffer when close tag is missing', () => {
    const state = createToolXmlFilterState()
    const maxBuffer = 16

    const chunk = '<codebuff_tool_call>' + 'x'.repeat(64)
    const first = filterToolXmlFromText(state, chunk, maxBuffer)
    expect(first.text).toBe('')
    expect(state.buffer.length).toBeLessThanOrEqual(maxBuffer)

    const second = filterToolXmlFromText(state, '</codebuff_tool_call>', maxBuffer)
    expect(second.text).toBe('')
    expect(state.activeTag).toBeNull()
    expect(state.buffer.length).toBe(0)
  })
})
