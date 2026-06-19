import { describe, expect, it } from 'bun:test'

import {
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL_ID,
  LIMITED_CHAT_MODEL_ID,
  chatModelForAccessTier,
  deriveThreadTitle,
} from '../models'

describe('chat models config', () => {
  it('tier models are configured models', () => {
    const ids = CHAT_MODELS.map((m) => m.id)
    expect(ids).toContain(DEFAULT_CHAT_MODEL_ID)
    expect(ids).toContain(LIMITED_CHAT_MODEL_ID)
  })

  it('every model has a unique, non-empty backend id', () => {
    const backendIds = CHAT_MODELS.map((m) => m.backendId)
    for (const id of backendIds) {
      expect(id.length).toBeGreaterThan(0)
    }
    expect(new Set(backendIds).size).toBe(backendIds.length)
  })
})

describe('chatModelForAccessTier', () => {
  it('gives full-access users MiniMax M3', () => {
    expect(chatModelForAccessTier('full')).toBe(DEFAULT_CHAT_MODEL_ID)
  })

  it('pins limited-access users to DeepSeek Flash', () => {
    expect(chatModelForAccessTier('limited')).toBe(LIMITED_CHAT_MODEL_ID)
  })
})

describe('deriveThreadTitle', () => {
  it('uses only the first line', () => {
    expect(deriveThreadTitle('hello\nworld')).toBe('hello')
  })

  it('falls back for empty input', () => {
    expect(deriveThreadTitle('   \n\n')).toBe('Image')
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
