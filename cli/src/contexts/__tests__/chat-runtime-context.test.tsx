import { describe, expect, test } from 'bun:test'
import { createTestRenderer } from '@opentui/core/testing'
import { createRoot, flushSync } from '@opentui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { useEffect, useState } from 'react'

import {
  ChatRuntimeProvider,
  useChatRuntime,
  type ChatRuntime,
} from '../chat-runtime-context'
import {
  registerActiveRun,
  stopActiveRun,
  type ActiveRunStopReason,
} from '../../utils/active-run'

import type { StreamStatus } from '../../hooks/use-message-queue'

describe('ChatRuntimeProvider navigation', () => {
  for (const phase of ['waiting', 'streaming'] satisfies StreamStatus[]) {
    test(`preserves ${phase} runtime while visiting chat history`, async () => {
      let runtime: ChatRuntime | undefined
      let setShowHistory: ((show: boolean) => void) | undefined
      let chatUnmounts = 0

      const RuntimeSnapshot = ({ screen }: { screen: 'chat' | 'history' }) => {
        runtime = useChatRuntime()
        return (
          <text>{`${screen}:${runtime.streamStatus}:${runtime.queuedMessages.length}`}</text>
        )
      }

      // These must remain distinct component types: production routing
      // unmounts Chat and mounts ChatHistoryScreen rather than updating props
      // on one shared view component.
      const ChatView = () => {
        useEffect(
          () => () => {
            chatUnmounts++
          },
          [],
        )
        return <RuntimeSnapshot screen="chat" />
      }
      const HistoryView = () => <RuntimeSnapshot screen="history" />

      const HistoryRouter = () => {
        const [showHistory, setHistory] = useState(false)
        setShowHistory = setHistory
        return showHistory ? <HistoryView /> : <ChatView />
      }

      const setup = await createTestRenderer({ width: 80, height: 3 })
      const root = createRoot(setup.renderer)
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      const inputRef = { current: null }
      flushSync(() => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <ChatRuntimeProvider inputRef={inputRef} continueChat={false}>
              <HistoryRouter />
            </ChatRuntimeProvider>
          </QueryClientProvider>,
        )
      })
      await setup.renderOnce()

      try {
        expect(runtime).toBeDefined()
        const stopReasons: ActiveRunStopReason[] = []
        registerActiveRun('navigation-test', (reason) => {
          stopReasons.push(reason)
        })

        flushSync(() => {
          runtime!.isChainInProgressRef.current = true
          runtime!.setStreamStatus(phase)
          runtime!.mainAgentTimer.start()
          runtime!.addToQueue('keep me queued')
        })
        await setup.renderOnce()

        const timerStartTime = runtime!.timerStartTime
        const sendMessage = runtime!.sendMessage
        expect(timerStartTime).not.toBeNull()
        expect(setup.captureCharFrame()).toContain(`chat:${phase}:1`)

        flushSync(() => setShowHistory!(true))
        await setup.renderOnce()

        expect(setup.captureCharFrame()).toContain(`history:${phase}:1`)
        expect(chatUnmounts).toBe(1)
        expect(runtime!.timerStartTime).toBe(timerStartTime)
        expect(runtime!.sendMessage).toBe(sendMessage)

        flushSync(() => setShowHistory!(false))
        await setup.renderOnce()

        expect(setup.captureCharFrame()).toContain(`chat:${phase}:1`)
        expect(runtime!.timerStartTime).toBe(timerStartTime)
        expect(runtime!.sendMessage).toBe(sendMessage)
        let stoppedRun = false
        flushSync(() => {
          stoppedRun = stopActiveRun('user-interrupt')
        })
        expect(stoppedRun).toBe(true)
        expect(stopReasons).toEqual(['user-interrupt'])
        await setup.renderOnce()
        expect(runtime!.queuePaused).toBe(true)
        expect(runtime!.queuedMessages).toHaveLength(1)

        // A queue add and interrupt can occur before React renders again.
        // The synchronous queue ref must still make the interrupt pause it.
        flushSync(() => {
          runtime!.clearQueue()
          runtime!.resumeQueue()
          registerActiveRun('same-tick-test', (reason) => {
            stopReasons.push(reason)
          })
          runtime!.addToQueue('queued in the interrupt tick')
          stoppedRun = stopActiveRun('user-interrupt')
        })
        expect(stoppedRun).toBe(true)
        await setup.renderOnce()
        expect(runtime!.queuePaused).toBe(true)
        expect(runtime!.queuedMessages).toHaveLength(1)
        expect(stopReasons).toEqual(['user-interrupt', 'user-interrupt'])

        // Context changes still clean a paused queue after the run owner has
        // already been released.
        flushSync(() => {
          stoppedRun = stopActiveRun('new-chat')
        })
        expect(stoppedRun).toBe(false)
        await setup.renderOnce()
        expect(runtime!.queuedMessages).toHaveLength(0)
        expect(runtime!.queuePaused).toBe(false)
      } finally {
        stopActiveRun('process-exit')
        flushSync(() => root.unmount())
        queryClient.clear()
        setup.renderer.destroy()
      }
    })
  }
})
