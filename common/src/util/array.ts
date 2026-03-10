// Native implementations replace lodash imports to reduce bundle size
// isEqual is kept from lodash for deep equality comparison

import isEqual from 'lodash/isEqual'

export function filterDefined<T>(array: (T | null | undefined)[]) {
  return array.filter((item) => item !== null && item !== undefined) as T[]
}

type Falsey = false | undefined | null | 0 | ''
type FalseyValueArray<T> = T | Falsey | FalseyValueArray<T>[]

export function buildArray<T>(...params: FalseyValueArray<T>[]) {
  // Native implementation replaces lodash compact + flattenDeep
  const flatten = <T>(arr: unknown): T[] => {
    return Array.isArray(arr)
      ? arr.flatMap((item) => flatten<T>(item))
      : [arr] as T[]
  }
  return flatten<T>(params).filter((item) => item != null) as T[]
}

export function groupConsecutive<T, U>(xs: T[], key: (x: T) => U) {
  if (!xs.length) {
    return []
  }
  const result: any[] = []
  let curr = { key: key(xs[0]), items: [xs[0]] }
  for (const x of xs.slice(1)) {
    const k = key(x)
    if (!isEqual(k, curr.key)) {
      result.push(curr)
      curr = { key: k, items: [x] }
    } else {
      curr.items.push(x)
    }
  }
  result.push(curr)
  return result
}
