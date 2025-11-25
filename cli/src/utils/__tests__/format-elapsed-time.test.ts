import { describe, test, expect } from 'bun:test'

import { formatElapsedTime } from '../format-elapsed-time'

describe('formatElapsedTime', () => {
  describe('seconds format (< 60s)', () => {
    test('formats 0 seconds', () => {
      expect(formatElapsedTime(0)).toBe('0s')
    })

    test('formats single digit seconds', () => {
      expect(formatElapsedTime(5)).toBe('5s')
      expect(formatElapsedTime(9)).toBe('9s')
    })

    test('formats double digit seconds', () => {
      expect(formatElapsedTime(30)).toBe('30s')
      expect(formatElapsedTime(45)).toBe('45s')
      expect(formatElapsedTime(59)).toBe('59s')
    })
  })

  describe('minutes format (60s - 3599s)', () => {
    test('formats exactly 1 minute', () => {
      expect(formatElapsedTime(60)).toBe('1m')
    })

    test('formats minutes with remaining seconds (floors down)', () => {
      expect(formatElapsedTime(90)).toBe('1m 30s')
      expect(formatElapsedTime(119)).toBe('1m 59s')
      expect(formatElapsedTime(125)).toBe('2m 5s')
    })

    test('formats double digit minutes', () => {
      expect(formatElapsedTime(600)).toBe('10m')
      expect(formatElapsedTime(1800)).toBe('30m')
      expect(formatElapsedTime(3540)).toBe('59m')
    })

    test('formats just under 1 hour', () => {
      expect(formatElapsedTime(3599)).toBe('59m 59s')
    })
  })

  describe('hours format (>= 3600s)', () => {
    test('formats exactly 1 hour', () => {
      expect(formatElapsedTime(3600)).toBe('1h')
    })

    test('formats hours with remaining time (floors down)', () => {
      expect(formatElapsedTime(3661)).toBe('1h 1m')
      expect(formatElapsedTime(5400)).toBe('1h 30m')
      expect(formatElapsedTime(7199)).toBe('1h 59m')
      expect(formatElapsedTime(7200)).toBe('2h')
    })

    test('formats multiple hours', () => {
      expect(formatElapsedTime(10800)).toBe('3h')
      expect(formatElapsedTime(36000)).toBe('10h')
      expect(formatElapsedTime(86400)).toBe('24h')
    })
  })

  describe('edge cases', () => {
    test('handles very large numbers', () => {
      expect(formatElapsedTime(999999)).toBe('277h 46m')
    })

    test('handles negative numbers gracefully (should not occur in practice)', () => {
      // Negative numbers shouldn't happen, but verify behavior
      const result = formatElapsedTime(-10)
      // Will return "-10s" - negative formatting is technically wrong but harmless
      expect(result).toBe('-10s')
    })

    test('handles boundary between seconds and minutes', () => {
      expect(formatElapsedTime(59)).toBe('59s')
      expect(formatElapsedTime(60)).toBe('1m')
      expect(formatElapsedTime(61)).toBe('1m 1s')
    })

    test('handles boundary between minutes and hours', () => {
      expect(formatElapsedTime(3599)).toBe('59m 59s')
      expect(formatElapsedTime(3600)).toBe('1h')
      expect(formatElapsedTime(3601)).toBe('1h') // 1 second rounds down to 0 minutes, shows as 1h
    })
  })

  describe('real-world scenarios', () => {
    test('formats typical LLM response times', () => {
      expect(formatElapsedTime(3)).toBe('3s') // Quick response
      expect(formatElapsedTime(15)).toBe('15s') // Average response
      expect(formatElapsedTime(45)).toBe('45s') // Longer response
      expect(formatElapsedTime(120)).toBe('2m') // Very long response
    })

    test('formats extended task durations', () => {
      expect(formatElapsedTime(180)).toBe('3m') // 3 minute task
      expect(formatElapsedTime(900)).toBe('15m') // 15 minute task
      expect(formatElapsedTime(3600)).toBe('1h') // 1 hour task
    })
  })
})
