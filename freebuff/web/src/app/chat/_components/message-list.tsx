'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'

import type { ChatMessage } from './types'

import { BlockList } from './agent-blocks'
import { Markdown } from './markdown'

// Scroll positions per thread, so switching chats in the sidebar brings you
// back to where you left off. Module-level: survives MessageList unmounting
// (e.g. visiting the empty "new chat" view) for the lifetime of the page.
// A null threadId (brand-new chat, mid-first-stream) isn't tracked — it has
// no stable identity yet and just follows the bottom.
const scrollPositions = new Map<string, number>()

function isNearBottom(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 80
}

export function MessageList(props: {
  /**
   * The thread the rendered messages belong to. Must be updated in the same
   * render as `messages` so scroll restoration runs against the right content.
   */
  threadId: string | null
  messages: ChatMessage[]
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedToBottom = useRef(true)
  // The thread whose scroll position has been restored into the container.
  const restoredThreadRef = useRef<string | null | undefined>(undefined)

  const threadId = props.threadId

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      pinnedToBottom.current = isNearBottom(el)
      if (threadId) scrollPositions.set(threadId, el.scrollTop)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [threadId])

  // On thread switch (or first mount), restore the saved position; threads
  // without one open at the bottom. Layout effect so the jump isn't visible.
  useLayoutEffect(() => {
    if (restoredThreadRef.current === threadId) return
    restoredThreadRef.current = threadId
    const el = scrollRef.current
    if (!el) return
    const saved = threadId ? scrollPositions.get(threadId) : undefined
    el.scrollTop = saved !== undefined ? saved : el.scrollHeight
    pinnedToBottom.current = isNearBottom(el)
  }, [threadId])

  // Follow the stream unless the user scrolled up.
  useEffect(() => {
    const el = scrollRef.current
    if (el && pinnedToBottom.current) {
      el.scrollTop = el.scrollHeight
      if (threadId) scrollPositions.set(threadId, el.scrollTop)
    }
  }, [threadId, props.messages])

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div
        aria-live="polite"
        className="mx-auto w-full max-w-3xl px-4 py-8 space-y-7"
      >
        {props.messages.map((message, i) =>
          message.role === 'user' ? (
            <div
              key={message.id}
              className="flex flex-col items-end gap-2"
            >
              {message.images && message.images.length > 0 && (
                <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
                  {message.images.map((img, idx) => (
                    <a
                      key={`${message.id}-img-${idx}`}
                      href={img.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block overflow-hidden rounded-xl border border-white/10"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.url}
                        alt={img.name ?? 'attached image'}
                        className="max-h-60 w-auto max-w-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}
              {message.content && (
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-white/[0.07] px-4 py-2.5 text-[15px] leading-6">
                  {message.content}
                </div>
              )}
            </div>
          ) : (
            <div key={message.id} className="text-[15px] leading-7">
              {message.blocks?.length ? (
                <BlockList
                  blocks={message.blocks}
                  latest={i === props.messages.length - 1}
                />
              ) : message.content ? (
                <Markdown text={message.content} />
              ) : message.streaming ? (
                <span
                  role="status"
                  aria-label="Assistant is thinking"
                  className="inline-flex items-center gap-1.5 py-1"
                >
                  <span className="h-2 w-2 animate-thinking-dot rounded-full bg-white/60" />
                  <span className="h-2 w-2 animate-thinking-dot rounded-full bg-white/60 [animation-delay:0.2s]" />
                  <span className="h-2 w-2 animate-thinking-dot rounded-full bg-white/60 [animation-delay:0.4s]" />
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
