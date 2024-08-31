import { useState, useEffect, MutableRefObject } from 'react'

export const useIntersection = (
  element: MutableRefObject<Element | null>,
  rootMargin: string,
  rootRef: MutableRefObject<Element | null>
) => {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const currElement = element?.current
    const currRoot = rootRef?.current
    if (!currElement || !currRoot) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting)
      },
      { rootMargin, root: currRoot }
    )
    currElement && observer.observe(currElement)

    return () => {
      if (currElement) {
        observer.unobserve(currElement)
      }
    }
  }, [element, rootMargin, rootRef])

  return isVisible
}
