import { useEffect } from 'react'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'

export const useAdTimer = (
  contractId: string,
  seconds: number,
  visible: boolean
) => {
  const [secondsLeft, setSecondsLeft] = usePersistentInMemoryState(
    seconds,
    `ad-timer-${contractId}`
  )

  useEffect(() => {
    if (secondsLeft <= 0) return

    if (visible) {
      const interval = setInterval(() => {
        setSecondsLeft(secondsLeft - 1)
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [secondsLeft, visible])

  return secondsLeft
}
