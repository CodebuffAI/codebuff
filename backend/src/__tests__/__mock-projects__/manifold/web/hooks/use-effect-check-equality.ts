import { isEqual } from 'lodash'
import { EffectCallback, useEffect, useRef } from 'react'

export const useEffectCheckEquality = (fn: EffectCallback, deps: any[]) => {
  const depsRef = useRef<any[] | undefined>(undefined)

  if (!depsRef.current || !isEqual(deps, depsRef.current)) {
    depsRef.current = deps
  }

  useEffect(fn, depsRef.current)
}
