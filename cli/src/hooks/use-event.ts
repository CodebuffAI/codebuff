import { useCallback, useRef } from 'react'

/**
 * Returns a stable function reference that always calls the latest version of the provided callback.
 * Similar to React's proposed useEvent RFC.
 *
 * The returned function has a stable identity across renders, but always calls the most recent
 * version of the callback you pass in. This is useful for event handlers and callbacks that
 * need to access the latest props/state without causing re-renders of child components.
 *
 * @param callback - The function to wrap
 * @returns A stable function reference that calls the latest version of the callback
 *
 * @example
 * const handleClick = useEvent(() => {
 *   console.log(count) // Always logs the latest count
 * })
 *
 * // handleClick has a stable reference, so it won't cause child re-renders
 * <ChildComponent onClick={handleClick} />
 */
export function useEvent<TArgs extends unknown[], TReturn>(
  callback: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
  const callbackRef = useRef<(...args: TArgs) => TReturn>(callback)

  // Update the ref to the latest callback on every render
  // This ensures the ref is always in sync with the current render
  callbackRef.current = callback

  // Return a stable function that calls the latest callback
  return useCallback(
    (...args: TArgs) => callbackRef.current(...args),
    [], // Empty deps array ensures the function identity is stable
  )
}
