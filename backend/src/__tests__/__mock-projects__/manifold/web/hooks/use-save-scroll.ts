import { useEffect } from 'react'
import { debounce } from 'lodash'
import { safeLocalStorage } from 'web/lib/util/local'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'

export const useSaveScroll = (
  locationKey: string,
  clearWhenMemoryClears?: boolean
) => {
  const key = `${locationKey}-scroll`
  const [savedInMemory, setSavedInMemory] = usePersistentInMemoryState(
    false,
    key
  )
  useEffect(() => {
    const onScroll = debounce(() => {
      safeLocalStorage?.setItem(key, window.scrollY.toString())
      setSavedInMemory(true)
    }, 100)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const scrollY = safeLocalStorage?.getItem(key)
    if (scrollY && !savedInMemory && clearWhenMemoryClears) {
      safeLocalStorage?.removeItem(key)
      return
    }
    if (scrollY) {
      window.scrollTo(0, parseInt(scrollY))
    }
  }, [])
}
