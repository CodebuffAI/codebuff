import { useEffect } from 'react'

let hasLoaded = false

export const useHasLoaded = () => {
  useEffect(() => {
    hasLoaded = true
  }, [])

  return hasLoaded
}
