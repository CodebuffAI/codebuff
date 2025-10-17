/**
 * Represents a source of data.
 *
 * By default, can be a value or a promise.
 *
 * In the case that the type is a not function itself, this can also be a function that returns the value or promise.
 */
export type Source<T> =
  | T
  | Promise<T>
  | (T extends (...args: unknown[]) => unknown ? never : () => T | Promise<T>)
