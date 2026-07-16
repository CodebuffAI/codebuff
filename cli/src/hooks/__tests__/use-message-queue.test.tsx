import { describe, expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import React from 'react'

import { useMessageQueue } from '../use-message-queue'

import type { QueuedMessage } from '../use-message-queue'

describe('useMessageQueue ownership', () => {
  test('a stale send cannot release a newer queue processing lock', async () => {
    const sends: Array<{
      message: QueuedMessage
      resolve: () => void
    }> = []
    const isChainInProgressRef = { current: false }
    const activeAgentStreamsRef = { current: 0 }
    let queue: ReturnType<typeof useMessageQueue> | undefined

    const Harness = () => {
      queue = useMessageQueue(
        (message) =>
          new Promise<void>((resolve) => {
            sends.push({ message, resolve })
          }),
        isChainInProgressRef,
        activeAgentStreamsRef,
      )
      return <text>{queue.isProcessingQueueRef.current ? 'busy' : 'idle'}</text>
    }

    const setup = await createTestRenderer({ width: 20, height: 2 })
    const root = createRoot(setup.renderer)
    flushSync(() => root.render(<Harness />))
    await setup.renderOnce()

    try {
      flushSync(() => queue!.addToQueue('run A'))
      await setup.renderOnce()
      expect(sends.map((send) => send.message.content)).toEqual(['run A'])
      expect(queue!.isProcessingQueueRef.current).toBe(true)

      // Match the active-run abort handler: it releases the public boolean so
      // another queued run can start before run A's promise settles.
      flushSync(() => {
        queue!.isProcessingQueueRef.current = false
        queue!.setCanProcessQueue(true)
        queue!.addToQueue('run B')
      })
      await setup.renderOnce()
      expect(sends.map((send) => send.message.content)).toEqual([
        'run A',
        'run B',
      ])
      expect(queue!.isProcessingQueueRef.current).toBe(true)

      sends[0]!.resolve()
      await Promise.resolve()
      await setup.renderOnce()
      expect(queue!.isProcessingQueueRef.current).toBe(true)

      sends[1]!.resolve()
      await Promise.resolve()
      await setup.renderOnce()
      expect(queue!.isProcessingQueueRef.current).toBe(false)
    } finally {
      flushSync(() => root.unmount())
      setup.renderer.destroy()
    }
  })
})
