import { createMockLogger } from '@/testing'
import { clampToRange, getRemoteConfigBool, getRemoteConfigNumber, isValidSampleRate } from './number-utils'

describe('number-utils', () => {
  const mockLogger = createMockLogger()

  describe('clampToRange', () => {
    it.each([
      [
        'returns max when value is not a number',
        {
          value: null,
          min: 10,
          max: 100,
          expected: 100,
          fallback: undefined,
        },
      ],
      [
        'returns max when value is not a number',
        {
          value: 'not-a-number',
          min: 10,
          max: 100,
          expected: 100,
          fallback: undefined,
        },
      ],
      [
        'returns max when value is greater than max',
        {
          value: 150,
          min: 10,
          max: 100,
          expected: 100,
          fallback: undefined,
        },
      ],
      [
        'returns min when value is less than min',
        {
          value: 5,
          min: 10,
          max: 100,
          expected: 10,
          fallback: undefined,
        },
      ],
      [
        'returns the value when it is within the range',
        {
          value: 50,
          min: 10,
          max: 100,
          expected: 50,
          fallback: undefined,
        },
      ],
      [
        'returns the fallback value when provided is not valid',
        {
          value: 'invalid',
          min: 10,
          max: 100,
          expected: 20,
          fallback: 20,
        },
      ],
      [
        'returns the max value when fallback is not valid',
        {
          value: 'invalid',
          min: 10,
          max: 75,
          expected: 75,
          fallback: '20',
        },
      ],
    ])('%s', (_description, { value, min, max, expected, fallback }) => {
      const result = clampToRange(value, min, max, mockLogger, fallback as any)
      expect(result).toBe(expected)
    })

    it('logs a warning when min is greater than max', () => {
      expect(clampToRange(50, 100, 10, mockLogger)).toBe(10)
      expect(mockLogger.warn).toHaveBeenCalledWith('min cannot be greater than max.')
    })
  })

  describe('getRemoteConfigBool', () => {
    it('returns default value when field is undefined or null', () => {
      expect(getRemoteConfigBool(undefined, 'key')).toBe(true)
      expect(getRemoteConfigBool(undefined, 'key', false)).toBe(false)
      expect(getRemoteConfigBool(null as any, 'key')).toBe(true)
    })

    it('returns the boolean directly when field is boolean', () => {
      expect(getRemoteConfigBool(true, 'key')).toBe(true)
      expect(getRemoteConfigBool(false, 'key')).toBe(false)
      expect(getRemoteConfigBool(false, 'key', true)).toBe(false)
    })

    it('returns the key value when field is an object with a boolean key', () => {
      expect(getRemoteConfigBool({ autocaptureExceptions: true }, 'autocaptureExceptions')).toBe(true)
      expect(getRemoteConfigBool({ autocaptureExceptions: false }, 'autocaptureExceptions')).toBe(false)
    })

    it('returns default value when key is missing or non-boolean', () => {
      expect(getRemoteConfigBool({ otherKey: 'value' }, 'autocaptureExceptions')).toBe(true)
      expect(getRemoteConfigBool({ otherKey: 'value' }, 'autocaptureExceptions', false)).toBe(false)
      expect(getRemoteConfigBool({ autocaptureExceptions: 'yes' }, 'autocaptureExceptions')).toBe(true)
    })

    it('returns default true for empty object', () => {
      expect(getRemoteConfigBool({}, 'key')).toBe(true)
    })
  })

  describe('getRemoteConfigNumber', () => {
    it('returns undefined for missing/invalid fields', () => {
      expect(getRemoteConfigNumber(undefined, 'sampleRate')).toBeUndefined()
      expect(getRemoteConfigNumber(false, 'sampleRate')).toBeUndefined()
      expect(getRemoteConfigNumber({}, 'sampleRate')).toBeUndefined()
      expect(getRemoteConfigNumber({ sampleRate: 'abc' }, 'sampleRate')).toBeUndefined()
      expect(getRemoteConfigNumber({ sampleRate: '' }, 'sampleRate')).toBeUndefined()
      expect(getRemoteConfigNumber({ sampleRate: '   ' }, 'sampleRate')).toBeUndefined()
    })

    it('returns numeric value from number', () => {
      expect(getRemoteConfigNumber({ sampleRate: 0.5 }, 'sampleRate')).toBe(0.5)
    })

    it('returns numeric value from numeric string', () => {
      expect(getRemoteConfigNumber({ sampleRate: '0.5' }, 'sampleRate')).toBe(0.5)
    })
  })

  describe('isValidSampleRate', () => {
    it('returns true only for finite values in [0, 1]', () => {
      expect(isValidSampleRate(0)).toBe(true)
      expect(isValidSampleRate(0.5)).toBe(true)
      expect(isValidSampleRate(1)).toBe(true)

      expect(isValidSampleRate(-0.1)).toBe(false)
      expect(isValidSampleRate(1.1)).toBe(false)
      expect(isValidSampleRate(Number.POSITIVE_INFINITY)).toBe(false)
      expect(isValidSampleRate(Number.NaN)).toBe(false)
      expect(isValidSampleRate('0.5')).toBe(false)
      expect(isValidSampleRate(null)).toBe(false)
    })
  })
})
