// A hook soon to be added to the React core library:
// https://github.com/reactjs/rfcs/blob/useevent/text/0000-useevent.md
// TODO: Once React adds this hook, use it instead.

import { useRef, useCallback } from 'react'
import { useSafeLayoutEffect } from './use-safe-layout-effect'

type AnyFunction = (...args: any[]) => any

export function useEvent<T extends AnyFunction>(callback?: T) {
  const ref = useRef<AnyFunction | undefined>(() => {
    throw new Error('Cannot call an event handler while rendering.')
  })
  useSafeLayoutEffect(() => {
    ref.current = callback
  })
  return useCallback<AnyFunction>(
    (...args) => ref.current?.apply(null, args),
    []
  ) as T
}
