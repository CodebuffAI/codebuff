import { describe, expect, mock, test } from 'bun:test'

import { findCommand } from '../command-registry'

import type { RouterParams } from '../command-registry'
import type { ChatMessage } from '../../types/chat'

describe('/diagnostics command', () => {
  test('adds runtime process diagnostics to the chat', () => {
    const command = findCommand('diagnostics')
    expect(command).toBeDefined()

    let messages: ChatMessage[] = []
    const saveToHistory = mock(() => {})
    const setInputValue = mock(() => {})
    command!.handler(
      {
        inputValue: '/diagnostics',
        setMessages: (update: Parameters<RouterParams['setMessages']>[0]) => {
          messages = typeof update === 'function' ? update(messages) : update
        },
        saveToHistory,
        setInputValue,
      } as unknown as RouterParams,
      '',
    )

    const output = messages.at(-1)?.content ?? ''
    expect(output).toContain('process diagnostics')
    expect(output).toContain(`Platform: ${process.platform} ${process.arch}`)
    expect(output).toContain(`CLI binary: PID ${process.pid}`)
    expect(saveToHistory).toHaveBeenCalledWith('/diagnostics')
    expect(setInputValue).toHaveBeenCalled()
  })
})
