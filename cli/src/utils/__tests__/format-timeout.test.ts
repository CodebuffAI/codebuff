import { describe, expect, test } from 'bun:test'

import { formatTimeout } from '../format-timeout'

describe('formatTimeout', () => {
  describe('normal values', () => {
    test('returns seconds for values less than 60', () => {
      expect(formatTimeout(10)).toBe('10s timeout')
      expect(formatTimeout(30)).toBe('30s timeout')
      expect(formatTimeout(45)).toBe('45s timeout')
    })

    test('returns minutes for values evenly divisible by 60', () => {
      expect(formatTimeout(60)).toBe('1m timeout')
      expect(formatTimeout(120)).toBe('2m timeout')
      expect(formatTimeout(300)).toBe('5m timeout')
    })

    test('returns hours for values evenly divisible by 3600', () => {
      expect(formatTimeout(3600)).toBe('1h timeout')
      expect(formatTimeout(7200)).toBe('2h timeout')
      expect(formatTimeout(10800)).toBe('3h timeout')
    })

    test('returns minutes for large values divisible by 60 but not 3600', () => {
      expect(formatTimeout(5400)).toBe('90m timeout')
    })

    test('returns seconds for large values not evenly divisible by 60', () => {
      expect(formatTimeout(3700)).toBe('3700s timeout')
    })

    test('returns seconds for values >= 60 not evenly divisible by 60', () => {
      expect(formatTimeout(90)).toBe('90s timeout')
      expect(formatTimeout(150)).toBe('150s timeout')
    })

    test('returns "0s timeout" for 0', () => {
      expect(formatTimeout(0)).toBe('0s timeout')
    })
  })

  describe('negative values', () => {
    test('returns "no timeout" for -1', () => {
      expect(formatTimeout(-1)).toBe('no timeout')
    })

    test('returns "no timeout" for other negative values', () => {
      expect(formatTimeout(-5)).toBe('no timeout')
      expect(formatTimeout(-100)).toBe('no timeout')
      expect(formatTimeout(-0.5)).toBe('no timeout')
    })
  })

  describe('non-finite values', () => {
    test('returns "no timeout" for NaN', () => {
      expect(formatTimeout(NaN)).toBe('no timeout')
    })

    test('returns "no timeout" for Infinity', () => {
      expect(formatTimeout(Infinity)).toBe('no timeout')
    })

    test('returns "no timeout" for -Infinity', () => {
      expect(formatTimeout(-Infinity)).toBe('no timeout')
    })
  })

  describe('floating point values', () => {
    test('rounds floating point values to nearest integer', () => {
      expect(formatTimeout(30.4)).toBe('30s timeout')
      expect(formatTimeout(30.5)).toBe('31s timeout')
      expect(formatTimeout(30.9)).toBe('31s timeout')
    })

    test('rounds floating point values for minute display', () => {
      expect(formatTimeout(59.5)).toBe('1m timeout')
      expect(formatTimeout(60.4)).toBe('1m timeout')
      expect(formatTimeout(119.6)).toBe('2m timeout')
    })

    test('handles floating point values that round to non-minute values', () => {
      expect(formatTimeout(60.6)).toBe('61s timeout')
      expect(formatTimeout(89.5)).toBe('90s timeout')
    })
  })
})
