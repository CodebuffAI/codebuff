export type SubsetOf<T, U extends T> = U

export type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}
