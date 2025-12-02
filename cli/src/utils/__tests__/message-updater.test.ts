import { describe, expect, test, mock } from 'bun:test'

import { createMessageUpdater } from '../message-updater'

import type { ChatMessage, ContentBlock } from '../../types/chat'

const baseMessages: ChatMessage[] = [
  {
    id: 'ai-1',
    variant: 'ai',
    content: '',
    blocks: [],
    timestamp: 'now',
  },
  {
    id: 'user-1',
    variant: 'user',
    content: 'hi',
    timestamp: 'now',
  },
]

describe('createMessageUpdater', () => {
  test('updates only the targeted AI message', () => {
    let state = [...baseMessages]
    const updater = createMessageUpdater(
      'ai-1',
      (fn) => {
        state = fn(state)
      },
      () => {},
    )

    updater.updateAiMessage((msg) => ({ ...msg, content: 'updated' }))

    expect(state[0].content).toBe('updated')
    expect(state[1].content).toBe('hi')
  })

  test('adds blocks and marks complete with metadata merge', () => {
    let state = [...baseMessages]
    const flush = mock(() => {})

    const updater = createMessageUpdater(
      'ai-1',
      (fn) => {
        state = fn(state)
      },
      flush,
    )

    const block: ContentBlock = { type: 'text', content: 'hello' }
    updater.addBlock(block)
    updater.markComplete({ metadata: { runState: { id: 'run-1' } } })

    expect(state[0].blocks?.[0]).toEqual(block)
    expect(state[0].isComplete).toBe(true)
    expect((state[0].metadata as any).runState).toEqual({ id: 'run-1' })
    expect(flush).toHaveBeenCalledTimes(1)
  })

  test('setError clears blocks and marks complete', () => {
    let state = [...baseMessages]
    const flush = mock(() => {})

    const updater = createMessageUpdater(
      'ai-1',
      (fn) => {
        state = fn(state)
      },
      flush,
    )

    updater.setError('boom')

    expect(state[0].content).toBe('boom')
    expect(state[0].isComplete).toBe(true)
    expect(state[0].blocks).toBeUndefined()
    expect(flush).toHaveBeenCalled()
  })
})
