import { useCallback, useEffect, useRef } from 'react'

import type { ScrollBoxRenderable } from '@opentui/core'

export const useScrollManagement = (
  scrollRef: React.RefObject<ScrollBoxRenderable | null>,
  messages: any[],
  agentRefsMap: React.MutableRefObject<Map<string, any>>,
) => {
  const autoScrollEnabledRef = useRef<boolean>(true)
  const programmaticScrollRef = useRef<boolean>(false)

  const scrollToLatest = useCallback((): void => {
    const scrollbox = scrollRef.current
    if (!scrollbox) return

    const maxScroll = Math.max(
      0,
      scrollbox.scrollHeight - scrollbox.viewport.height,
    )
    programmaticScrollRef.current = true
    scrollbox.verticalScrollBar.scrollPosition = maxScroll
  }, [scrollRef])

  const scrollToAgent = useCallback(
    (agentId: string, retries = 5) => {
      setTimeout(() => {
        const scrollbox = scrollRef.current
        if (!scrollbox) return

        const agentElement = agentRefsMap.current.get(agentId)
        if (!agentElement) {
          if (retries > 0) {
            scrollToAgent(agentId, retries - 1)
          }
          return
        }

        const agentViewportY = agentElement.y ?? 0
        const agentHeight = agentElement.height ?? 0
        const viewportHeight = scrollbox.viewport.height
        const scrollHeight = scrollbox.scrollHeight
        const currentScroll = scrollbox.scrollTop

        const agentY = agentViewportY + currentScroll
        const absoluteMaxScroll = Math.max(0, scrollHeight - viewportHeight)
        const minScroll = Math.max(0, agentY + agentHeight - viewportHeight)
        const maxScrollBound = Math.min(agentY, absoluteMaxScroll)

        if (currentScroll >= minScroll && currentScroll <= maxScrollBound) {
          return
        }

        const idealViewportY = Math.floor(viewportHeight / 3)
        const idealScroll = agentY - idealViewportY

        let targetScroll: number
        if (minScroll > maxScrollBound) {
          targetScroll = Math.min(agentY, absoluteMaxScroll)
        } else {
          targetScroll = Math.max(
            minScroll,
            Math.min(idealScroll, maxScrollBound),
          )
        }

        programmaticScrollRef.current = true
        scrollbox.scrollTo(targetScroll)
      }, 100)
    },
    [scrollRef, agentRefsMap],
  )

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
        return
      }

      autoScrollEnabledRef.current = isNearBottom
    }

    scrollbox.verticalScrollBar.on('change', handleScrollChange)

    return () => {
      scrollbox.verticalScrollBar.off('change', handleScrollChange)
    }
  }, [scrollRef])

  useEffect(() => {
    const scrollbox = scrollRef.current
    if (scrollbox) {
      const timeoutId = setTimeout(() => {
        const maxScroll = Math.max(
          0,
          scrollbox.scrollHeight - scrollbox.viewport.height,
        )

        if (scrollbox.scrollTop > maxScroll) {
          scrollbox.scrollTop = maxScroll
        } else if (autoScrollEnabledRef.current) {
          scrollToLatest()
        }
      }, 50)

      return () => clearTimeout(timeoutId)
    }
    return undefined
  }, [messages, scrollToLatest, scrollRef])

  return {
    scrollToLatest,
    scrollToAgent,
  }
}
