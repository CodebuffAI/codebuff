import { useReducer } from 'react'

/** usage: [state, updateState] = usePartialUpdater(initial) for an object */
export const usePartialUpdater = <T extends Record<string, any>>(
  defaultValue: T
) => {
  return useReducer(
    (state: T, update: Partial<T>): T => ({ ...state, ...update }),
    defaultValue
  )
}
