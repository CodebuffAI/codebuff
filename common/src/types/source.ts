export type Source<T> =
  | T
  | Promise<T>
  | (T extends (...args: unknown[]) => unknown ? never : () => T | Promise<T>)
