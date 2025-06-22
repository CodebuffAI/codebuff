import { stripNullChars } from '@codebuff/common/util/string'

/**
 * Recursively traverses an object or array and removes null characters (\u0000)
 * from all string values.
 *
 * @param input The object or array to sanitize.
 * @returns A new object or array with null characters removed from strings.
 */
export function stripNullCharsFromObject<T>(input: T): T {
  if (typeof input === 'string') {
    // Explicitly cast back to T, assuming T could be string
    return stripNullChars(input) as T
  }

  if (Array.isArray(input)) {
    // Explicitly cast back to T, assuming T could be an array type
    return input.map(stripNullCharsFromObject) as T
  }

  if (input !== null && typeof input === 'object') {
    const sanitizedObject: { [key: string]: any } = {}
    for (const key in input) {
      // Ensure we only process own properties
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        sanitizedObject[key] = stripNullCharsFromObject(input[key])
      }
    }
    // Explicitly cast back to T
    return sanitizedObject as T
  }

  // Return non-object/array/string types as is
  return input
}