import { afterEach, describe, expect, test } from 'bun:test'

import { useChatStore } from '../chat-store'

afterEach(() => {
  const store = useChatStore.getState()
  store.setInputFocused(true)
  store.setIsFocusSupported(false)
})

describe('chat store focus state', () => {
  test('chat reset preserves terminal focus and detected capabilities', () => {
    const store = useChatStore.getState()
    store.setInputFocused(false)
    store.setIsFocusSupported(true)

    store.reset()

    expect(useChatStore.getState().inputFocused).toBe(false)
    expect(useChatStore.getState().isFocusSupported).toBe(true)
  })
})
