import { useEffect, useState } from 'react'

/** @deprecated not actually deprecated but for the love of god use css*/
export const useWindowSize = () => {
  const [size, setSize] = useState<{
    width: number | undefined
    height: number | undefined
  }>({ width: undefined, height: undefined })

  useEffect(() => {
    const onResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }

    onResize()
    setTimeout(onResize, 100) // hack to fix initial render on ios

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return size
}
