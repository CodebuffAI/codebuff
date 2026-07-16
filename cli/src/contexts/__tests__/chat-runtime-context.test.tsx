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
        const abortController = new AbortController()

        flushSync(() => {
          runtime!.isChainInProgressRef.current = true
          runtime!.abortControllerRef.current = abortController
          runtime!.setStreamStatus(phase)
          runtime!.mainAgentTimer.start()
          runtime!.addToQueue('keep me queued')
        })
        await setup.renderOnce()

        const timerStartTime = runtime!.timerStartTime
        const abortControllerRef = runtime!.abortControllerRef
        const sendMessage = runtime!.sendMessage
        expect(timerStartTime).not.toBeNull()
        expect(setup.captureCharFrame()).toContain(`chat:${phase}:1`)

        flushSync(() => setShowHistory!(true))
        await setup.renderOnce()

        expect(setup.captureCharFrame()).toContain(`history:${phase}:1`)
        expect(chatUnmounts).toBe(1)
        expect(runtime!.timerStartTime).toBe(timerStartTime)
        expect(runtime!.abortControllerRef).toBe(abortControllerRef)
        expect(runtime!.abortControllerRef.current).toBe(abortController)
        expect(runtime!.sendMessage).toBe(sendMessage)

        flushSync(() => setShowHistory!(false))
        await setup.renderOnce()

        expect(setup.captureCharFrame()).toContain(`chat:${phase}:1`)
        expect(runtime!.timerStartTime).toBe(timerStartTime)
        expect(runtime!.abortControllerRef.current).toBe(abortController)
        expect(runtime!.sendMessage).toBe(sendMessage)
      } finally {
        flushSync(() => root.unmount())
        queryClient.clear()
        setup.renderer.destroy()
      }
    })
  }
})
