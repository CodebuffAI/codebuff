import { useCallback, useRef, useState } from 'react'
import { useSafeLayoutEffect } from './use-safe-layout-effect'

const getSize = (elem: HTMLElement | null) =>
  elem
    ? { width: elem.clientWidth, height: elem.clientHeight }
    : { width: undefined, height: undefined }

export function useMeasureSize() {
  const elemRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(() => getSize(null))

  const handleResize = useCallback(() => setSize(getSize(elemRef.current)), [])

  useSafeLayoutEffect(() => {
    if (!elemRef.current) return

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(elemRef.current)

    return () => resizeObserver.disconnect()
  }, [handleResize])

  return { elemRef, ...size }
}
