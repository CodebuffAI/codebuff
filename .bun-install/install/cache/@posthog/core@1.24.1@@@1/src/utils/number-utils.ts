import { JsonType, Logger } from '../types'
import { isNumber } from './type-utils'

/**
 * Clamps a value to a range.
 * @param value the value to clamp
 * @param min the minimum value
 * @param max the maximum value
 * @param label if provided then enables logging and prefixes all logs with labels
 * @param fallbackValue if provided then returns this value if the value is not a valid number
 */
export function clampToRange(value: unknown, min: number, max: number, logger: Logger, fallbackValue?: number): number {
  if (min > max) {
    logger.warn('min cannot be greater than max.')
    min = max
  }

  if (!isNumber(value)) {
    logger.warn(' must be a number. using max or fallback. max: ' + max + ', fallback: ' + fallbackValue)
    return clampToRange(fallbackValue || max, min, max, logger)
  } else if (value > max) {
    logger.warn(' cannot be  greater than max: ' + max + '. Using max value instead.')
    return max
  } else if (value < min) {
    logger.warn(' cannot be less than min: ' + min + '. Using min value instead.')
    return min
  } else {
    return value
  }
}

/**
 * Reads a boolean value from a remote config field.
 *
 * Remote config fields follow a pattern: they are either a boolean (false = disabled),
 * an object with specific keys, or absent/undefined.
 *
 * @param field The remote config field (e.g., `response.errorTracking`, `response.capturePerformance`)
 * @param key The key to read from the object form (e.g., `'autocaptureExceptions'`, `'network_timing'`)
 * @param defaultValue Value to return when the field is absent/undefined (defaults to `true` — don't block locally enabled capture)
 */
export function getRemoteConfigBool(
  field: boolean | { [key: string]: JsonType } | undefined,
  key: string,
  defaultValue: boolean = true
): boolean {
  if (field == null) {
    return defaultValue
  }
  if (typeof field === 'boolean') {
    return field
  }
  if (typeof field === 'object') {
    const value = field[key]
    return typeof value === 'boolean' ? value : defaultValue
  }
  return defaultValue
}

/**
 * Reads a numeric value from a remote config object field.
 *
 * Remote config values may be either numbers or numeric strings.
 *
 * @param field The remote config field (e.g. `response.sessionRecording`)
 * @param key The key to read (e.g. `'sampleRate'`)
 */
export function getRemoteConfigNumber(
  field: boolean | { [key: string]: JsonType } | undefined,
  key: string
): number | undefined {
  if (field == null || typeof field !== 'object') {
    return undefined
  }

  const value = field[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') {
      return undefined
    }
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

/**
 * Checks whether a value is a valid session replay sample rate in the inclusive range [0, 1].
 */
export function isValidSampleRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}
