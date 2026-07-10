import { describe, expect, it } from 'bun:test'

import { isThinkOnlyResponse, stripThinkTags } from '../think-tags'

describe('stripThinkTags', () => {
  it('strips paired think tags', () => {
    expect(stripThinkTags('<think>plan the change</think>')).toBe('')
    expect(stripThinkTags('<think>a</think>\n\n<think>b</think>')).toBe('')
  })

  it('strips unclosed open think tags', () => {
    expect(stripThinkTags('<think>partial thought')).toBe('')
  })

  it('strips orphan close think tags', () => {
    expect(stripThinkTags('</think>')).toBe('')
    expect(stripThinkTags('</think> ')).toBe('')
    expect(stripThinkTags('  </think>\n')).toBe('')
  })

  it('preserves non-think content around tags', () => {
    expect(stripThinkTags('<think>x</think>\nI will edit the file.')).toBe(
      'I will edit the file.',
    )
    expect(stripThinkTags('</think>\nNext I will spawn the editor.')).toBe(
      'Next I will spawn the editor.',
    )
  })
})

describe('isThinkOnlyResponse', () => {
  it('is false for empty / whitespace-only responses', () => {
    expect(isThinkOnlyResponse('')).toBe(false)
    expect(isThinkOnlyResponse('   \n')).toBe(false)
  })

  it('is true for paired, unclosed, and orphan think scaffolding', () => {
    expect(isThinkOnlyResponse('<think>reasoning</think>')).toBe(true)
    expect(isThinkOnlyResponse('<think>partial')).toBe(true)
    expect(isThinkOnlyResponse('</think>')).toBe(true)
    expect(isThinkOnlyResponse('</think> ')).toBe(true)
  })

  it('is false when there is real content besides think tags', () => {
    expect(isThinkOnlyResponse('Done.')).toBe(false)
    expect(isThinkOnlyResponse('<think>x</think>\nDone.')).toBe(false)
    expect(isThinkOnlyResponse('</think>\nDone.')).toBe(false)
  })
})
