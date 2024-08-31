import { useEffect, useRef } from 'react'
import { useEvent } from 'web/hooks/use-event'

export function useIsVisible(
  onSeenStart: () => void,
  triggerOnce = false,
  isLoaded = true,
  onSeenEnd?: () => void
) {
  const ref = useRef<HTMLDivElement | null>(null)
  const seenOnce = useRef(false)
  const eventOnVisible = useEvent(onSeenStart)
  const eventOnInvisible = useEvent(onSeenEnd)

  useEffect(() => {
    const element = ref.current
    if (!element || !isLoaded) return

    const innerHeight = window.innerHeight * 0.9
    const elementHeight = element.getBoundingClientRect().height
    const threshold = elementHeight >= innerHeight ? 0.01 : 0.9

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            eventOnVisible()
            seenOnce.current = true
            if (triggerOnce && !onSeenEnd) observer.unobserve(element)
          } else if (seenOnce.current) {
            if (onSeenEnd) eventOnInvisible()
            if (triggerOnce) observer.unobserve(element)
          }
        })
      },
      { threshold }
    )

    if (!triggerOnce || (triggerOnce && !seenOnce.current))
      observer.observe(element)

    return () => {
      observer.unobserve(element)
    }
  }, [ref, triggerOnce, eventOnVisible, eventOnInvisible, isLoaded])

  return { ref }
}
