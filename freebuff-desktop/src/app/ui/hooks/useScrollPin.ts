import { useEffect, useRef, useState } from 'react'

import type { Message } from '../lib/types'

/**
 * Transcript scroll behavior for a thread: auto-scroll while pinned to the tail,
 * plus a "scroll to bottom / new messages" affordance when the user scrolls up.
 *
 * ThreadView is reused across thread switches (not keyed by threadId), so the
 * scroll node and tracking state would otherwise bleed between threads — hence
 * the reset effect on `threadId`.
 */
export function useScrollPin(threadId: string, messages: Message[] | undefined) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  // Whether the transcript is scrolled to (near) the tail.
  const [atBottom, setAtBottom] = useState(true)
  // Set when new content streams in while the user is scrolled up.
  const [hasNew, setHasNew] = useState(false)

  // Smoothly jump to the tail and re-pin so auto-scroll resumes.
  const scrollToBottom = () => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    pinnedRef.current = true
    setHasNew(false)
  }

  // Reset to the tail when the thread changes: re-pin, clear the
  // new-message indicator, and snap to bottom.
  useEffect(() => {
    pinnedRef.current = true
    setAtBottom(true)
    setHasNew(false)
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [threadId])

  // Auto-scroll to the tail while the user is already pinned to the bottom.
  // Otherwise, content streaming in while scrolled up flags "new messages".
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      if (pinnedRef.current) el.scrollTop = el.scrollHeight
      else setHasNew(true)
    }
  }, [messages])

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    pinnedRef.current = near
    setAtBottom(near)
    if (near) setHasNew(false)
  }

  return { scrollRef, atBottom, hasNew, scrollToBottom, onScroll }
}
