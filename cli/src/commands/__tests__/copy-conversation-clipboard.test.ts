import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { handleCopyConversationCommand } from '../copy-conversation'
import { useChatStore } from '../../state/chat-store'
import {
  clearClipboardMessage,
  registerClipboardRenderer,
  subscribeClipboardMessages,
  unregisterClipboardRenderer,
} from '../../utils/clipboard'

import type { RouterParams } from '../command-registry'
import type { ChatMessage } from '../../types/chat'

const hugeMessage: ChatMessage = {
  id: 'huge-user-message',
  variant: 'user',
  content: 'word '.repeat(10_000),
  timestamp: '2026-08-13T00:00:00.000Z',
}

const commandParams = {
  inputValue: '/copy',
  saveToHistory: () => {},
  setInputValue: () => {},
} as unknown as RouterParams

describe('/copy OSC 52 fallback', () => {
  let originalPlatform: PropertyDescriptor | undefined
  let originalEnv: Record<string, string | undefined>

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    originalEnv = {
      TERM: process.env.TERM,
      SSH_CLIENT: process.env.SSH_CLIENT,
      SSH_TTY: process.env.SSH_TTY,
      SSH_CONNECTION: process.env.SSH_CONNECTION,
    }
    Object.defineProperty(process, 'platform', {
      value: 'freebsd',
      configurable: true,
    })
    process.env.TERM = 'dumb'
    delete process.env.SSH_CLIENT
    delete process.env.SSH_TTY
    delete process.env.SSH_CONNECTION
    useChatStore.setState({ messages: [hugeMessage] })
  })

  afterEach(() => {
    unregisterClipboardRenderer()
    clearClipboardMessage()
    useChatStore.getState().reset()
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform)
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  test('uses a bounded fallback when local native copy is unavailable', async () => {
    const clipboardWrites: string[] = []
    registerClipboardRenderer({
      copyToClipboardOSC52: (text: string) => {
        clipboardWrites.push(text)
        return true
      },
    })
    const statusMessages: (string | null)[] = []
    const unsubscribe = subscribeClipboardMessages((message) =>
      statusMessages.push(message),
    )

    await handleCopyConversationCommand(commandParams)

    expect(clipboardWrites).toHaveLength(1)
    expect(Buffer.byteLength(clipboardWrites[0]!, 'utf8')).toBeLessThanOrEqual(
      22_000,
    )
    expect(clipboardWrites[0]).toContain('truncated to fit clipboard')
    expect(statusMessages).toContain(
      'Copied conversation · 1 message (older messages truncated to fit clipboard)',
    )
    unsubscribe()
  })

  test('uses the bounded representation directly over remote OSC 52', async () => {
    process.env.SSH_CONNECTION = '192.0.2.1 12345 192.0.2.2 22'
    const clipboardWrites: string[] = []
    registerClipboardRenderer({
      copyToClipboardOSC52: (text: string) => {
        clipboardWrites.push(text)
        return true
      },
    })

    await handleCopyConversationCommand(commandParams)

    expect(clipboardWrites).toHaveLength(1)
    expect(Buffer.byteLength(clipboardWrites[0]!, 'utf8')).toBeLessThanOrEqual(
      22_000,
    )
    expect(clipboardWrites[0]).toContain('truncated to fit clipboard')
  })
})
