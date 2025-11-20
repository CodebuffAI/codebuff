import { useCallback, useEffect, useRef, useState } from 'react'

import type { ScrollBoxRenderable } from '@opentui/core'
import { logger } from '../utils/logger'

// Scroll detection threshold - how close to bottom to consider "at bottom"
const SCROLL_NEAR_BOTTOM_THRESHOLD = 1

// Animation constants
const ANIMATION_FRAME_INTERVAL_MS = 16 // ~60fps
const DEFAULT_SCROLL_ANIMATION_DURATION_MS = 200

// Delay before auto-scrolling after content changes
const AUTO_SCROLL_DELAY_MS = 50

const easeOutCubic = (t: number): number => {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Manages scroll behavior for the chat scrollbox with smooth animations and auto-scroll.
 *
 * @param scrollRef - Reference to the scrollbox component
 * @param messages - Array of chat messages (triggers auto-scroll on change)
 * @param isUserCollapsing - Callback to check if user is actively collapsing/expanding toggles.
 *                          When true, auto-scroll is temporarily suppressed to prevent jarring UX.
 * @returns Scroll management functions and state
 */
export const useChatScrollbox = (
  scrollRef: React.RefObject<ScrollBoxRenderable | null>,
  messages: any[],
  isUserCollapsing: () => boolean,
) => {
  const autoScrollEnabledRef = useRef<boolean>(true)
  const programmaticScrollRef = useRef<boolean>(false)
  const animationFrameRef = useRef<number | null>(null)
  const [isAtBottom, setIsAtBottom] = useState<boolean>(true)

  const cancelAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      clearTimeout(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  const animateScrollTo = useCallback(
    (targetScroll: number, duration = DEFAULT_SCROLL_ANIMATION_DURATION_MS) => {
      const scrollbox = scrollRef.current
      if (!scrollbox) return

      cancelAnimation()

      const startScroll = scrollbox.scrollTop
      const distance = targetScroll - startScroll
      const startTime = Date.now()
      const frameInterval = ANIMATION_FRAME_INTERVAL_MS

      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)
        const easedProgress = easeOutCubic(progress)
        const newScroll = startScroll + distance * easedProgress

        programmaticScrollRef.current = true
        scrollbox.scrollTop = newScroll

        if (progress < 1) {
          animationFrameRef.current = setTimeout(animate, frameInterval) as any
        } else {
          animationFrameRef.current = null
        }
      }

      animate()
    },
    [scrollRef, cancelAnimation],
  )

  const scrollToLatest = useCallback((): void => {
    const scrollbox = scrollRef.current
    if (!scrollbox) return

    const maxScroll = Math.max(
      0,
      scrollbox.scrollHeight - scrollbox.viewport.height,
    )
    animateScrollTo(maxScroll)
  }, [scrollRef, animateScrollTo])

  useEffect(() => {
    const scrollbox = scrollRef.current
    if (!scrollbox) return

    const handleScrollChange = () => {
      const maxScroll = Math.max(
        0,
        scrollbox.scrollHeight - scrollbox.viewport.height,
      )
      const current = scrollbox.verticalScrollBar.scrollPosition
      const isNearBottom =
        Math.abs(maxScroll - current) <= SCROLL_NEAR_BOTTOM_THRESHOLD

      if (programmaticScrollRef.current) {
        programmaticScrollRef.current = false
        autoScrollEnabledRef.current = true
        setIsAtBottom(true)
        return
      }

      cancelAnimation()
      autoScrollEnabledRef.current = isNearBottom
      setIsAtBottom((prev) => (prev === isNearBottom ? prev : isNearBottom))
    }

    scrollbox.verticalScrollBar.on('change', handleScrollChange)

    return () => {
      scrollbox.verticalScrollBar.off('change', handleScrollChange)
    }
  }, [scrollRef, cancelAnimation])

  useEffect(() => {
    const scrollbox = scrollRef.current
    if (scrollbox) {
      const timeoutId = setTimeout(() => {
        const maxScroll = Math.max(
          0,
          scrollbox.scrollHeight - scrollbox.viewport.height,
        )

        if (scrollbox.scrollTop > maxScroll) {
          programmaticScrollRef.current = true
          scrollbox.scrollTop = maxScroll
        } else if (autoScrollEnabledRef.current && !isUserCollapsing()) {
          programmaticScrollRef.current = true
          scrollbox.scrollTop = maxScroll
        }
      }, AUTO_SCROLL_DELAY_MS)

      return () => clearTimeout(timeoutId)
    }
    return undefined
  }, [messages, scrollToLatest, scrollRef, isUserCollapsing])

  useEffect(() => {
    return () => {
      cancelAnimation()
    }
  }, [cancelAnimation])

  return {
    scrollToLatest,
    scrollboxProps: {},
    isAtBottom,
  }
}
