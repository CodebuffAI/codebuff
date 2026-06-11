'use client'

import { useEffect, useRef } from 'react'

import type { ChatMessage } from './types'

import { BlockList } from './agent-blocks'
import { Markdown } from './markdown'

export function MessageList(props: { messages: ChatMessage[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedToBottom = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      pinnedToBottom.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Follow the stream unless the user scrolled up.
  useEffect(() => {
    const el = scrollRef.current
    if (el && pinnedToBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [props.messages])

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div
        aria-live="polite"
        className="mx-auto w-full max-w-3xl px-4 py-8 space-y-7"
      >
        {props.messages.map((message) =>
          message.role === 'user' ? (
            <div key={message.id} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-white/[0.07] px-4 py-2.5 text-[15px] leading-6">
                {message.content}
              </div>
            </div>
          ) : (
            <div key={message.id} className="text-[15px] leading-7">
              {message.blocks?.length ? (
                <BlockList blocks={message.blocks} />
              ) : message.content ? (
                <Markdown text={message.content} />
              ) : message.streaming ? (
                <span
                  role="status"
                  className="inline-block h-4 w-4 animate-pulse rounded-full bg-white/40"
                >
                  <span className="sr-only">Assistant is responding</span>
                </span>
              ) : null}
              {message.error && (
                <p className="mt-2 text-sm text-red-400">{message.error}</p>
              )}
            </div>
          ),
        )}
        <div className="h-8" />
      </div>
    </div>
  )
}
