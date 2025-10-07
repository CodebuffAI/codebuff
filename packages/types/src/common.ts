import type { UnionToIntersection } from 'bun-types/vendor/expect-type'

type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

type ParamsOfFunction<T> = T extends (params: infer C) => any ? C : never
type ParamsOfArray<T> = UnionToIntersection<
  T extends [infer fn, ...infer rest]
    ? ParamsOfFunction<fn> | ParamsOfArray<rest>
    : {}
>
type ParamsOfUnion<T> = UnionToIntersection<ParamsOfFunction<T>>

export type ParamsOf<T> = Prettify<
  T extends any[] ? ParamsOfArray<T> : ParamsOfUnion<T>
>
