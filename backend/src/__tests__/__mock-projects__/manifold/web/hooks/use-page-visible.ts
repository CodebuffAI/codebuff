import { useState, useEffect } from 'react'

export const useIsPageVisible = () => {
  const [isPageVisible, setIsPageVisible] = useState(
    typeof document !== 'undefined' ? !document.hidden : true
  )

  useEffect(() => {
    const updateVisibility = () => {
      setIsPageVisible(!document.hidden)
    }
    document.addEventListener('visibilitychange', updateVisibility)
    return () => {
      document.removeEventListener('visibilitychange', updateVisibility)
    }
  }, [])

  return isPageVisible
}
