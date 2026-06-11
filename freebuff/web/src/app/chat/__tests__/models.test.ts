import { describe, expect, it } from 'bun:test'

import {
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL_ID,
  deriveThreadTitle,
  isChatModelId,
  resolveChatModel,
} from '../models'

describe('chat models config', () => {
  it('default model is a selectable model', () => {
    expect(isChatModelId(DEFAULT_CHAT_MODEL_ID)).toBe(true)
  })

  it('rejects unknown model ids', () => {
    expect(isChatModelId('gpt-4')).toBe(false)
    expect(isChatModelId('')).toBe(false)
  })

  it('every model has a unique, non-empty backend id', () => {
    const backendIds = CHAT_MODELS.map((m) => m.backendId)
    for (const id of backendIds) {
      expect(id.length).toBeGreaterThan(0)
    }
    expect(new Set(backendIds).size).toBe(backendIds.length)
  })
})

describe('resolveChatModel', () => {
  it('pins limited users to the default model regardless of request', () => {
    expect(resolveChatModel('limited', 'deepseek-v4-pro')).toBe(
      DEFAULT_CHAT_MODEL_ID,
    )
  })

  it('lets full users pick any known model', () => {
    expect(resolveChatModel('full', 'deepseek-v4-pro')).toBe('deepseek-v4-pro')
  })

  it('falls back to the default for unknown models', () => {
    expect(resolveChatModel('full', 'not-a-model')).toBe(DEFAULT_CHAT_MODEL_ID)
  })
})

describe('deriveThreadTitle', () => {
  it('uses only the first line', () => {
    expect(deriveThreadTitle('hello\nworld')).toBe('hello')
  })

  it('falls back for empty input', () => {
    expect(deriveThreadTitle('   \n\n')).toBe('New chat')
  })

  it('truncates long titles with an ellipsis', () => {
    const title = deriveThreadTitle('x'.repeat(100))
    expect(title.endsWith('…')).toBe(true)
    expect([...title].length).toBe(61)
  })

  it('does not split surrogate pairs at the cut point', () => {
    const title = deriveThreadTitle('😀'.repeat(100))
    expect(title).not.toContain('�')
    // Strip the ellipsis, then confirm we still have whole emoji.
    const body = title.slice(0, -1)
    expect([...body].every((cp) => cp === '😀')).toBe(true)
  })

  it('keeps short titles intact', () => {
    expect(deriveThreadTitle('Plan my trip to Kyoto')).toBe(
      'Plan my trip to Kyoto',
    )
  })
})
