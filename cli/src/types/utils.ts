export type SubsetOf<T, U extends T> = U

export type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

export type SetElement<T extends Set<any>> = T extends Set<infer U> ? U : never
