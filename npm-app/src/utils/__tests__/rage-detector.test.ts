// @ts-ignore
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'

import { AnalyticsEvent } from 'common/constants/analytics-events'

import {
  createCountDetector,
  createTimeBetweenDetector,
  createTimeoutDetector,
} from '../rage-detector'

// Mock the analytics module
const mockTrackEvent = mock(() => {})
mock.module('../analytics', () => ({
  trackEvent: mockTrackEvent,
}))

describe('Rage Detectors', () => {
  let mockDateNow: any
  let mockSetTimeout: any
  let mockClearTimeout: any
  let currentTime = 0
  let timeouts: Array<{
    callback: Function
    delay: number
    id: number
    scheduledTime: number
  }> = []
  let timeoutId = 1

  beforeEach(() => {
    mock.restore()
    mockTrackEvent.mockClear()
    currentTime = 0
    timeouts = []
    timeoutId = 1

    // Mock Date.now
    mockDateNow = spyOn(Date, 'now').mockImplementation(() => currentTime)

    // Mock setTimeout
    mockSetTimeout = spyOn(global, 'setTimeout').mockImplementation(
      (callback: Function, delay: number) => {
        const id = timeoutId++
        timeouts.push({
          callback,
          delay,
          id,
          scheduledTime: currentTime + delay,
        })
        return id as any
      }
    )

    // Mock clearTimeout
    mockClearTimeout = spyOn(global, 'clearTimeout').mockImplementation(
      (id: number) => {
        timeouts = timeouts.filter((timeout) => timeout.id !== id)
      }
    )
  })

  afterEach(() => {
    mock.restore()
  })

  const advanceTime = (ms: number) => {
    currentTime += ms
    // Execute any timeouts that should have fired
    const toExecute = timeouts.filter(
      (timeout) => timeout.scheduledTime <= currentTime
    )
    timeouts = timeouts.filter((timeout) => timeout.scheduledTime > currentTime)
    toExecute.forEach((timeout) => timeout.callback())
  }

  describe('createCountDetector', () => {
    test('should fire when threshold of repeated keys is met within time window', () => {
      const detector = createCountDetector({
        reason: 'key_mashing',
        mode: 'COUNT',
        threshold: 3,
        timeWindow: 1000,
        historyLimit: 10,
      })

      // Record 3 consecutive 'd' key presses
      detector.recordEvent('d')
      detector.recordEvent('d')
      detector.recordEvent('d')

      expect(mockTrackEvent).toHaveBeenCalledWith(AnalyticsEvent.RAGE, {
        reason: 'key_mashing',
        count: 3,
        timeWindow: 1000,
        repeatedKey: 'd',
      })
    })

    test('should NOT fire when keys are different', () => {
      const detector = createCountDetector({
        reason: 'key_mashing',
        mode: 'COUNT',
        threshold: 3,
        timeWindow: 1000,
        historyLimit: 10,
      })

      // Record different keys
      detector.recordEvent('a')
      detector.recordEvent('b')
      detector.recordEvent('c')

      expect(mockTrackEvent).not.toHaveBeenCalled()
    })

    test('should NOT fire when threshold is not met', () => {
      const detector = createCountDetector({
        reason: 'key_mashing',
        mode: 'COUNT',
        threshold: 5,
        timeWindow: 1000,
        historyLimit: 10,
      })

      // Record only 2 repeated keys (below threshold of 5)
      detector.recordEvent('d')
      detector.recordEvent('d')

      expect(mockTrackEvent).not.toHaveBeenCalled()
    })

    test('should NOT fire when events are outside time window', () => {
      const detector = createCountDetector({
        reason: 'key_mashing',
        mode: 'COUNT',
        threshold: 3,
        timeWindow: 1000,
        historyLimit: 10,
      })

      // Record first key
      detector.recordEvent('d')

      // Advance time beyond window
      advanceTime(1500)

      // Record more keys - should not count the first one
      detector.recordEvent('d')
      detector.recordEvent('d')

      expect(mockTrackEvent).not.toHaveBeenCalled()
    })

    test('should respect debounce period', () => {
      const detector = createCountDetector({
        reason: 'key_mashing',
        mode: 'COUNT',
        threshold: 3,
        timeWindow: 1000,
        historyLimit: 10,
        debounceMs: 5000,
      })

      // First trigger
      detector.recordEvent('d')
      detector.recordEvent('d')
      detector.recordEvent('d')

      expect(mockTrackEvent).toHaveBeenCalledTimes(1)
      mockTrackEvent.mockClear()

      // Try to trigger again immediately - should be debounced
      detector.recordEvent('d')
      detector.recordEvent('d')
      detector.recordEvent('d')

      expect(mockTrackEvent).not.toHaveBeenCalled()

      // Advance past debounce period
      advanceTime(5000)

      // Should be able to trigger again
      detector.recordEvent('d')
      detector.recordEvent('d')
      detector.recordEvent('d')

      expect(mockTrackEvent).toHaveBeenCalledTimes(1)
    })
  })

  describe('createTimeBetweenDetector', () => {
    test('should fire when end() is called within threshold', () => {
      const detector = createTimeBetweenDetector({
        reason: 'quick_cancel',
        mode: 'TIME_BETWEEN',
        threshold: 3000,
      })

      detector.start()
      advanceTime(2000) // 2 seconds < 3 second threshold
      detector.end()

      expect(mockTrackEvent).toHaveBeenCalledWith(AnalyticsEvent.RAGE, {
        reason: 'quick_cancel',
        duration: 2000,
        threshold: 3000,
      })
    })

    test('should NOT fire when end() is called after threshold', () => {
      const detector = createTimeBetweenDetector({
        reason: 'quick_cancel',
        mode: 'TIME_BETWEEN',
        threshold: 3000,
      })

      detector.start()
      advanceTime(4000) // 4 seconds > 3 second threshold
      detector.end()

      expect(mockTrackEvent).not.toHaveBeenCalled()
    })

    test('should NOT fire when end() is called without start()', () => {
      const detector = createTimeBetweenDetector({
        reason: 'quick_cancel',
        mode: 'TIME_BETWEEN',
        threshold: 3000,
      })

      detector.end()

      expect(mockTrackEvent).not.toHaveBeenCalled()
    })

    test('should respect cooldown period', () => {
      const detector = createTimeBetweenDetector({
        reason: 'quick_cancel',
        mode: 'TIME_BETWEEN',
        threshold: 3000,
        debounceMs: 10000,
      })

      // First trigger
      detector.start()
      advanceTime(2000)
      detector.end()

      expect(mockTrackEvent).toHaveBeenCalledTimes(1)
      mockTrackEvent.mockClear()

      // Try to trigger again immediately - should be in cooldown
      detector.start()
      advanceTime(2000)
      detector.end()

      expect(mockTrackEvent).not.toHaveBeenCalled()

      // Advance past cooldown period
      advanceTime(10000)

      // Should be able to trigger again
      detector.start()
      advanceTime(2000)
      detector.end()

      expect(mockTrackEvent).toHaveBeenCalledTimes(1)
    })
  })

  describe('createTimeoutDetector', () => {
    test('should fire when stop() is not called within timeout', () => {
      const detector = createTimeoutDetector({
        reason: 'websocket_hang',
        timeoutMs: 60000,
      })

      detector.start({ context: 'test' })
      advanceTime(60000) // Advance to timeout

      expect(mockTrackEvent).toHaveBeenCalledWith(
        AnalyticsEvent.RAGE,
        expect.objectContaining({
          reason: 'websocket_hang',
          durationMs: 60000,
          timeoutMs: 60000,
          context: 'test',
        })
      )
    })

    test('should NOT fire when stop() is called before timeout', () => {
      const detector = createTimeoutDetector({
        reason: 'websocket_hang',
        timeoutMs: 60000,
      })

      detector.start()
      advanceTime(30000) // Advance halfway
      detector.stop()
      advanceTime(60000) // Advance past original timeout

      expect(mockTrackEvent).not.toHaveBeenCalled()
    })

    test('should call onHang callback when timeout occurs', () => {
      const onHangCallback = mock(() => {})
      const detector = createTimeoutDetector({
        reason: 'websocket_hang',
        timeoutMs: 60000,
        onHang: onHangCallback,
      })

      detector.start()
      advanceTime(60000)

      expect(onHangCallback).toHaveBeenCalledTimes(1)
    })

    test('should clear previous timeout when start() is called again', () => {
      const detector = createTimeoutDetector({
        reason: 'websocket_hang',
        timeoutMs: 60000,
      })

      detector.start()
      advanceTime(30000)

      // Start again - should clear previous timeout
      detector.start()
      advanceTime(30000) // Total 60s from first start, but only 30s from second

      expect(mockTrackEvent).not.toHaveBeenCalled()

      // Advance another 30s to trigger the second timeout
      advanceTime(30000)

      expect(mockTrackEvent).toHaveBeenCalledTimes(1)
    })
  })
})
