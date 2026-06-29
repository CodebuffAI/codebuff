import { useEffect, useRef, useState } from 'react'

import type { Message } from '../lib/types'

/**
 * Transcript scroll behavior for a thread: auto-scroll while pinned to the tail,
 * a "scroll to bottom / new messages" affordance when the user scrolls up, and a
 * sticky reminder of the last user prompt once it scrolls out of view.
 *
 * ThreadView is reused across thread switches (not keyed by threadId), so the
 * scroll node and tracking state would otherwise bleed between threads — hence
 * the reset effect on `threadId`.
 */
export function useScrollPin(threadId: string, messages: Message[] | undefined) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  // Whether the last user message has scrolled up out of view — only then do we
  // surface the sticky reminder of what was asked.
  const [showPinned, setShowPinned] = useState(false)
  // Whether the transcript is scrolled to (near) the tail.
  const [atBottom, setAtBottom] = useState(true)
  // Set when new content streams in while the user is scrolled up.
  const [hasNew, setHasNew] = useState(false)

  // Show the sticky reminder only once the last user message's bottom has
  // scrolled above the top of the scroll viewport.
  const updatePinned = () => {
    const el = scrollRef.current
    if (!el) return
    const users = el.querySelectorAll('.msg.user')
    const last = users[users.length - 1] as HTMLElement | undefined
    if (!last) {
      setShowPinned(false)
      return
    }
    const containerTop = el.getBoundingClientRect().top
    const lastBottom = last.getBoundingClientRect().bottom
    setShowPinned(lastBottom < containerTop)
  }

  // Smoothly jump to the tail and re-pin so auto-scroll resumes.
  const scrollToBottom = () => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    pinnedRef.current = true
    setHasNew(false)
  }

  // Scroll the most recent user prompt back into view (clicking the sticky bar).
  const scrollToLastPrompt = () => {
    const el = scrollRef.current
    if (!el) return
    const users = el.querySelectorAll('.msg.user')
    const last = users[users.length - 1] as HTMLElement | undefined
    last?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Reset to the tail when the thread changes: re-pin, clear the
  // new-message/pinned indicators, and snap to bottom.
  useEffect(() => {
    pinnedRef.current = true
    setAtBottom(true)
    setHasNew(false)
    setShowPinned(false)
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
    updatePinned()
  }, [messages])

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    pinnedRef.current = near
    setAtBottom(near)
    if (near) setHasNew(false)
    updatePinned()
  }

  return { scrollRef, showPinned, atBottom, hasNew, scrollToBottom, scrollToLastPrompt, onScroll }
}
