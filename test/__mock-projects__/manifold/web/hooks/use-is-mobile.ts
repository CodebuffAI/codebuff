import { useEffect } from 'react'
import { usePersistentLocalState } from './use-persistent-local-state'

// 640 matches tailwind sm breakpoint
export function useIsMobile(threshold = 640) {
  // Save in localstorage because isMobile status doesn't change much.
  const [isMobile, setIsMobile] = usePersistentLocalState(false, 'is-mobile')
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < threshold)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [threshold, setIsMobile])
  return isMobile
}
