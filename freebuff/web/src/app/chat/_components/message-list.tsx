'use client'

import { X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef } from 'react'

import type { ChatImage, ChatMessage, QueuedMessage } from './types'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { BlockList } from './agent-blocks'
import { Markdown } from './markdown'

// A user turn's bubble: the attached-image grid plus the text bubble. Shared by
// the real transcript and the pending "queued" messages; `dimmed` greys out a
// not-yet-sent message and `trailing` slots in an action (e.g. a remove button).
function UserBubble(props: {
  content: string
  images?: ChatImage[]
  dimmed?: boolean
  trailing?: ReactNode
}) {
  return (
    <div className="flex flex-col items-end gap-2">
      {props.images && props.images.length > 0 && (
        <div
          className={cn(
            'flex max-w-[85%] flex-wrap justify-end gap-2',
            props.dimmed && 'opacity-50',
          )}
        >
          {props.images.map((img, idx) => (
            <a
              key={idx}
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
      {props.content && (
        <div className="group flex max-w-[85%] items-start gap-1.5">
          <div
            className={cn(
              'whitespace-pre-wrap rounded-2xl rounded-br-md bg-white/[0.07] px-4 py-2.5 text-[15px] leading-6',
              props.dimmed && 'text-foreground/60',
            )}
          >
            {props.content}
          </div>
          {props.trailing}
        </div>
      )}
    </div>
  )
}

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
  /** Messages buffered while a run is in flight; rendered as pending bubbles
   *  after the transcript and auto-sent as each run finishes. */
  queued?: QueuedMessage[]
  onRemoveQueued?: (index: number) => void
  /** Sends a clicked suggested followup's prompt as the next user message. */
  onSendSuggestion?: (prompt: string) => void
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
  }, [threadId, props.messages, props.queued])

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div
        aria-live="polite"
        className="mx-auto w-full max-w-3xl px-4 py-8 space-y-7"
      >
        {props.messages.map((message, i) =>
          message.role === 'user' ? (
            <UserBubble
              key={message.id}
              content={message.content}
              images={message.images}
            />
          ) : (
            <div key={message.id} className="text-[15px] leading-7">
              {message.blocks?.length ? (
                <BlockList
                  blocks={message.blocks}
                  latest={i === props.messages.length - 1}
                  onSendSuggestion={props.onSendSuggestion}
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
        {props.queued?.map((message, i) => (
          <UserBubble
            key={i}
            content={message.content}
            images={message.images}
            dimmed
            trailing={
              <button
                type="button"
                onClick={() => props.onRemoveQueued?.(i)}
                aria-label="Remove queued message"
                title="Queued — will send when the current response finishes"
                className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-white/10 hover:text-foreground group-hover:opacity-100 focus:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            }
          />
        ))}
        <div className="h-8" />
      </div>
    </div>
  )
}
