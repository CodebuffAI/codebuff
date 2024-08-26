import { useEffect } from 'react'

export function useDebouncedEffect(
  cb: () => unknown,
  delay: number,
  deps?: unknown[]
) {
  useEffect(() => {
    const handler = setTimeout(() => cb(), delay)
    return () => {
      clearTimeout(handler)
    }
  }, [delay, ...(deps ?? [])])
}

export default useDebouncedEffect
