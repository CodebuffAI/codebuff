import { useCallback, useEffect, useRef } from 'react'

/**
 * A hook that provides safe timeout management with automatic cleanup.
 * Prevents memory leaks by ensuring timeouts are cleared on unmount.
 *
 * @returns An object with methods to set and clear timeouts safely
 *
 * @example
 * ```tsx
 * const { setTimeout: setSafeTimeout, clearTimeout: clearSafeTimeout } = useSafeTimeout()
 *
 * // Set a timeout
 * setSafeTimeout(() => {
 *   console.log('This will run after 1 second')
 * }, 1000)
 *
 * // Clear it manually if needed
 * clearSafeTimeout()
 * ```
 */
export const useSafeTimeout = () => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const clearSafeTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const setSafeTimeout = useCallback(
    (callback: () => void, delay: number) => {
      // Clear any existing timeout first
      clearSafeTimeout()

      timeoutRef.current = setTimeout(() => {
        callback()
        timeoutRef.current = null
      }, delay)
    },
    [clearSafeTimeout]
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSafeTimeout()
    }
  }, [clearSafeTimeout])

  return {
    setTimeout: setSafeTimeout,
    clearTimeout: clearSafeTimeout,
    isActive: () => timeoutRef.current !== null,
  }
}
