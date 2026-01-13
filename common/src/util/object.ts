import { isEqual, mapValues, union } from 'lodash'

type RemoveUndefined<T extends object> = {
  [K in keyof T as T[K] extends undefined ? never : K]: Exclude<T[K], undefined>
}

export const removeUndefinedProps = <T extends object>(
  obj: T,
): RemoveUndefined<T> => {
  const newObj: Record<string, unknown> = {}

  for (const key of Object.keys(obj)) {
    const value = obj[key as keyof T]
    if (value !== undefined) newObj[key] = value
  }

  return newObj as RemoveUndefined<T>
}

export const removeNullOrUndefinedProps = <T extends object>(
  obj: T,
  exceptions?: string[],
): T => {
  const newObj: Record<string, unknown> = {}

  for (const key of Object.keys(obj)) {
    const value = obj[key as keyof T]
    if (
      (value !== undefined && value !== null) ||
      (exceptions ?? []).includes(key)
    )
      newObj[key] = value
  }
  return newObj as T
}

export const addObjects = <T extends { [key: string]: number }>(
  obj1: T,
  obj2: T,
) => {
  const keys = union(Object.keys(obj1), Object.keys(obj2))
  const newObj: Record<string, number> = {}

  for (const key of keys) {
    newObj[key] = (obj1[key] ?? 0) + (obj2[key] ?? 0)
  }

  return newObj as T
}

export const subtractObjects = <T extends { [key: string]: number }>(
  obj1: T,
  obj2: T,
) => {
  const keys = union(Object.keys(obj1), Object.keys(obj2))
  const newObj: Record<string, number> = {}

  for (const key of keys) {
    newObj[key] = (obj1[key] ?? 0) - (obj2[key] ?? 0)
  }

  return newObj as T
}

export const hasChanges = <T extends object>(obj: T, partial: Partial<T>) => {
  const currValues = mapValues(partial, (_, key: keyof T) => obj[key])
  return !isEqual(currValues, partial)
}

export const hasSignificantDeepChanges = <T extends object>(
  obj: T,
  partial: Partial<T>,
  epsilonForNumbers: number,
): boolean => {
  const compareValues = (currValue: unknown, partialValue: unknown): boolean => {
    if (typeof currValue === 'number' && typeof partialValue === 'number') {
      return Math.abs(currValue - partialValue) > epsilonForNumbers
    }
    if (
      typeof currValue === 'object' &&
      currValue !== null &&
      typeof partialValue === 'object' &&
      partialValue !== null
    ) {
      return hasSignificantDeepChanges(
        currValue as Record<string, unknown>,
        partialValue as Partial<Record<string, unknown>>,
        epsilonForNumbers,
      )
    }
    return !isEqual(currValue, partialValue)
  }

  for (const key in partial) {
    if (Object.prototype.hasOwnProperty.call(partial, key)) {
      if (compareValues(obj[key], partial[key])) {
        return true
      }
    }
  }

  return false
}

export const filterObject = <T extends object>(
  obj: T,
  predicate: (value: T[keyof T], key: keyof T) => boolean,
): { [P in keyof T]: T[P] } => {
  const result = {} as { [P in keyof T]: T[P] }
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (predicate(obj[key], key)) {
        result[key] = obj[key]
      }
    }
  }
  return result
}

/**
 * Asserts that a condition is true. If the condition is false, it throws an error with the provided message.
 * @param condition The condition to check
 * @param message The error message to display if the condition is false
 * @throws {Error} If the condition is false
 */
export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}
