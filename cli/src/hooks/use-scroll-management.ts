import { useCallback, useEffect, useRef, useState } from 'react'

import type { ScrollBoxRenderable } from '@opentui/core'

const easeOutCubic = (t: number): number => {
  return 1 - Math.pow(1 - t, 3)
}

export const useChatScrollbox = (
  scrollRef: React.RefObject<ScrollBoxRenderable | null>,
  messages: any[],
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
    (targetScroll: number, duration = 200) => {
      const scrollbox = scrollRef.current
      if (!scrollbox) return

      cancelAnimation()

      const startScroll = scrollbox.scrollTop
      const distance = targetScroll - startScroll
      const startTime = Date.now()
      const frameInterval = 16

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
      const isNearBottom = Math.abs(maxScroll - current) <= 1

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
        } else if (autoScrollEnabledRef.current) {
          programmaticScrollRef.current = true
          scrollbox.scrollTop = maxScroll
        }
      }, 50)

      return () => clearTimeout(timeoutId)
    }
    return undefined
  }, [messages, scrollToLatest, scrollRef])

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
