import { useEffect, useRef, useState } from 'react'

export const useHeaderIsStuck = (threshold: number = 0.1) => {
  const ref = useRef<any>(null)
  const [headerStuck, setStuck] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([e]) => setStuck(e.intersectionRatio < threshold),
      { threshold }
    )
    observer.observe(element)
    return () => observer.unobserve(element)
  }, [ref])

  return { ref, headerStuck }
}
