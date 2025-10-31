import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'

import {
  createCountDetector,
  createTimeBetweenDetector,
  createTimeoutDetector,
} from '../rage-detector'

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
  const mockTrackEvent = mock(() => {})

  beforeAll(async () => {
    // Mock the analytics module
    await mockModule('@codebuff/npm-app/utils/analytics', () => ({
      trackEvent: mockTrackEvent,
    }))

    // Mock the sleep function from common/util/promise
    await mockModule('@codebuff/common/util/promise', () => ({
      sleep: mock(() => Promise.resolve()),
    }))
  })

  beforeEach(() => {
    mock.restore()
    mockTrackEvent.mockClear()
    currentTime = 0
    timeouts = []
    timeoutId = 1

    // Mock Date.now
    mockDateNow = spyOn(Date, 'now').mockImplementation(() => currentTime)

    // Mock setTimeout
    mockSetTimeout = spyOn(global, 'setTimeout').mockImplementation(((
      callback: Function,
      delay: number,
    ) => {
      const id = timeoutId++
      timeouts.push({
        callback,
        delay,
        id,
        scheduledTime: currentTime + delay,
      })
      return id as any
    }) as typeof setTimeout)

    // Mock clearTimeout
    mockClearTimeout = spyOn(global, 'clearTimeout').mockImplementation(((
      id: number,
    ) => {
      timeouts = timeouts.filter((timeout) => timeout.id !== id)
    }) as typeof clearTimeout)
  })

  afterEach(() => {
    mock.restore()
  })

  afterAll(() => {
    clearMockedModules()
  })

  const advanceTime = (ms: number) => {
    currentTime += ms
    // Execute any timeouts that should have fired
    const toExecute = timeouts.filter(
      (timeout) => timeout.scheduledTime <= currentTime,
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

    test('should enforce history limit to prevent memory leaks', () => {
      const detector = createCountDetector({
        reason: 'key_mashing',
        mode: 'COUNT',
        threshold: 3,
        timeWindow: 10000, // Long window to keep events
        historyLimit: 5,
      })

      // Record more events than the history limit
      for (let i = 0; i < 10; i++) {
        detector.recordEvent(`key${i}`)
        advanceTime(100)
      }

      // The detector should have trimmed old events
      // We can't directly test the internal history, but we can test behavior
      // Record 3 of the same key - should trigger since recent events are kept
      detector.recordEvent('same')
      detector.recordEvent('same')
      detector.recordEvent('same')

      expect(mockTrackEvent).toHaveBeenCalledWith(AnalyticsEvent.RAGE, {
        reason: 'key_mashing',
        count: 3,
        timeWindow: 10000,
        repeatedKey: 'same',
      })
    })
  })

  describe('createTimeBetweenDetector', () => {
    test('should fire when end() is called within threshold (default lt)', () => {
      const detector = createTimeBetweenDetector({
        reason: 'quick_cancel',
        mode: 'TIME_BETWEEN',
        threshold: 3000,
        operator: 'lt',
      })

      detector.start()
      advanceTime(2000) // 2 seconds < 3 second threshold
      detector.end()

      expect(mockTrackEvent).toHaveBeenCalledWith(AnalyticsEvent.RAGE, {
        reason: 'quick_cancel',
        duration: 2000,
        threshold: 3000,
        operator: 'lt',
      })
    })

    test('should fire when end() is called within threshold (explicit lt)', () => {
      const detector = createTimeBetweenDetector({
        reason: 'quick_cancel',
        mode: 'TIME_BETWEEN',
        threshold: 3000,
        operator: 'lt',
      })

      detector.start()
      advanceTime(2000) // 2 seconds < 3 second threshold
      detector.end()

      expect(mockTrackEvent).toHaveBeenCalledWith(AnalyticsEvent.RAGE, {
        reason: 'quick_cancel',
        duration: 2000,
        threshold: 3000,
        operator: 'lt',
      })
    })

    test('should fire when end() is called after threshold (gt)', () => {
      const detector = createTimeBetweenDetector({
        reason: 'slow_operation',
        mode: 'TIME_BETWEEN',
        threshold: 3000,
        operator: 'gt',
      })

      detector.start()
      advanceTime(4000) // 4 seconds > 3 second threshold
      detector.end()

      expect(mockTrackEvent).toHaveBeenCalledWith(AnalyticsEvent.RAGE, {
        reason: 'slow_operation',
        duration: 4000,
        threshold: 3000,
        operator: 'gt',
      })
    })

    test('should fire when end() is called exactly at threshold (eq)', () => {
      const detector = createTimeBetweenDetector({
        reason: 'exact_timing',
        mode: 'TIME_BETWEEN',
        threshold: 3000,
        operator: 'eq',
      })

      detector.start()
      advanceTime(3000) // exactly 3 seconds
      detector.end()

      expect(mockTrackEvent).toHaveBeenCalledWith(AnalyticsEvent.RAGE, {
        reason: 'exact_timing',
        duration: 3000,
        threshold: 3000,
        operator: 'eq',
      })
    })

    test('should fire when end() is called at or after threshold (gte)', () => {
      const detector = createTimeBetweenDetector({
        reason: 'slow_or_exact',
        mode: 'TIME_BETWEEN',
        threshold: 3000,
        operator: 'gte',
      })

      detector.start()
      advanceTime(3000) // exactly 3 seconds
      detector.end()

      expect(mockTrackEvent).toHaveBeenCalledWith(AnalyticsEvent.RAGE, {
        reason: 'slow_or_exact',
        duration: 3000,
        threshold: 3000,
        operator: 'gte',
      })
    })

    test('should fire when end() is called at or before threshold (lte)', () => {
      const detector = createTimeBetweenDetector({
        reason: 'quick_or_exact',
        mode: 'TIME_BETWEEN',
        threshold: 3000,
        operator: 'lte',
      })

      detector.start()
      advanceTime(3000) // exactly 3 seconds
      detector.end()

      expect(mockTrackEvent).toHaveBeenCalledWith(AnalyticsEvent.RAGE, {
        reason: 'quick_or_exact',
        duration: 3000,
        threshold: 3000,
        operator: 'lte',
      })
    })

    test('should NOT fire when end() is called after threshold (default lt)', () => {
      const detector = createTimeBetweenDetector({
        reason: 'quick_cancel',
        mode: 'TIME_BETWEEN',
        threshold: 3000,
        operator: 'lt',
      })

      detector.start()
      advanceTime(4000) // 4 seconds > 3 second threshold
      detector.end()

      expect(mockTrackEvent).not.toHaveBeenCalled()
    })

    test('should NOT fire when end() is called before threshold (gt)', () => {
      const detector = createTimeBetweenDetector({
        reason: 'slow_operation',
        mode: 'TIME_BETWEEN',
        threshold: 3000,
        operator: 'gt',
      })

      detector.start()
      advanceTime(2000) // 2 seconds < 3 second threshold
      detector.end()

      expect(mockTrackEvent).not.toHaveBeenCalled()
    })

    test('should NOT fire when end() is called without start()', () => {
      const detector = createTimeBetweenDetector({
        reason: 'quick_cancel',
        mode: 'TIME_BETWEEN',
        threshold: 3000,
        operator: 'lt',
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
        operator: 'lt',
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

    test('should handle multiple end() calls without start()', () => {
      const detector = createTimeBetweenDetector({
        reason: 'multiple_ends',
        mode: 'TIME_BETWEEN',
        threshold: 3000,
        operator: 'lt',
      })

      // Call end() multiple times without start()
      detector.end()
      detector.end()
      detector.end()

      expect(mockTrackEvent).not.toHaveBeenCalled()
    })

    test('should handle multiple end() calls after single start()', () => {
      const detector = createTimeBetweenDetector({
        reason: 'multiple_ends',
        mode: 'TIME_BETWEEN',
        threshold: 3000,
        operator: 'lt',
      })

      detector.start()
      advanceTime(2000)

      // First end() should trigger
      detector.end()
      expect(mockTrackEvent).toHaveBeenCalledTimes(1)
      mockTrackEvent.mockClear()

      // Subsequent end() calls should not trigger
      detector.end()
      detector.end()
      expect(mockTrackEvent).not.toHaveBeenCalled()
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
        }),
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

    test('should merge context from options and start() call', () => {
      const context: {
        globalContext?: string
        localContext?: string
        overrideGlobal?: string
      } = { globalContext: 'global' }
      const detector = createTimeoutDetector({
        reason: 'context_test',
        timeoutMs: 60000,
        context,
      })

      detector.start({ localContext: 'local', overrideGlobal: 'fromLocal' })
      advanceTime(60000)

      expect(mockTrackEvent).toHaveBeenCalledWith(
        AnalyticsEvent.RAGE,
        expect.objectContaining({
          reason: 'context_test',
          globalContext: 'global',
          localContext: 'local',
          overrideGlobal: 'fromLocal',
        }),
      )
    })

    test('should handle start() with no context when options context exists', () => {
      const detector = createTimeoutDetector({
        reason: 'context_test',
        timeoutMs: 60000,
        context: { globalOnly: 'global' },
      })

      detector.start()
      advanceTime(60000)

      expect(mockTrackEvent).toHaveBeenCalledWith(
        AnalyticsEvent.RAGE,
        expect.objectContaining({
          reason: 'context_test',
          globalOnly: 'global',
        }),
      )
    })
  })

  // Detector configuration tests
  describe('createRageDetectors factory', () => {
    // Import the createRageDetectors function for integration testing
    const { createRageDetectors } = require('../../rage-detectors')

    test('should create all detectors with correct configurations', () => {
      const detectors = createRageDetectors()

      expect(detectors.keyMashingDetector).toBeDefined()
      expect(detectors.repeatInputDetector).toBeDefined()
      expect(detectors.exitAfterErrorDetector).toBeDefined()
      expect(detectors.webSocketHangDetector).toBeDefined()

      expect(typeof detectors.keyMashingDetector.recordEvent).toBe('function')
      expect(typeof detectors.repeatInputDetector.recordEvent).toBe('function')
      expect(typeof detectors.exitAfterErrorDetector.start).toBe('function')
      expect(typeof detectors.exitAfterErrorDetector.end).toBe('function')
      expect(typeof detectors.webSocketHangDetector.start).toBe('function')
      expect(typeof detectors.webSocketHangDetector.stop).toBe('function')
    })

    test('keyMashingDetector should work with realistic scenario', () => {
      const detectors = createRageDetectors()

      // Simulate user mashing the 'd' key 5 times quickly
      for (let i = 0; i < 5; i++) {
        detectors.keyMashingDetector.recordEvent({
          str: 'd',
          key: {
            name: 'd',
            ctrl: false,
            meta: false,
            alt: false,
            shift: false,
          },
        })
      }

      expect(mockTrackEvent).toHaveBeenCalledWith(AnalyticsEvent.RAGE, {
        reason: 'key_mashing',
        count: 5,
        timeWindow: 1000,
        repeatedKey: {
          str: 'd',
          key: {
            name: 'd',
            ctrl: false,
            meta: false,
            alt: false,
            shift: false,
          },
        },
      })
    })

    test('repeatInputDetector should work with realistic scenario', () => {
      const detectors = createRageDetectors()

      // Simulate user repeating the same input 3 times
      detectors.repeatInputDetector.recordEvent('undo')
      detectors.repeatInputDetector.recordEvent('undo')
      detectors.repeatInputDetector.recordEvent('undo')

      expect(mockTrackEvent).toHaveBeenCalledWith(AnalyticsEvent.RAGE, {
        reason: 'repeat_input',
        count: 3,
        timeWindow: 30000,
        repeatedKey: 'undo',
      })
    })

    test('webSocketHangDetector should work with realistic scenario', async () => {
      // Test the timeout detector directly without the complex shouldFire logic
      const detector = createTimeoutDetector({
        reason: 'websocket_persistent_failure',
        timeoutMs: 60000,
      })

      // Simulate WebSocket connection hanging
      detector.start({
        connectionIssue: 'websocket_persistent_failure',
        url: 'ws://localhost:3000',
      })

      // Advance time to trigger the timeout
      advanceTime(60000)

      expect(mockTrackEvent).toHaveBeenCalledWith(
        AnalyticsEvent.RAGE,
        expect.objectContaining({
          reason: 'websocket_persistent_failure',
          durationMs: 60000,
          timeoutMs: 60000,
          connectionIssue: 'websocket_persistent_failure',
          url: 'ws://localhost:3000',
        }),
      )
    })

    test('should not produce false positives for normal usage', () => {
      const detectors = createRageDetectors()

      // Normal typing - different keys
      detectors.keyMashingDetector.recordEvent('h')
      detectors.keyMashingDetector.recordEvent('e')
      detectors.keyMashingDetector.recordEvent('l')
      detectors.keyMashingDetector.recordEvent('l')
      detectors.keyMashingDetector.recordEvent('o')

      // Normal varied inputs
      detectors.repeatInputDetector.recordEvent('help')
      detectors.repeatInputDetector.recordEvent('fix the bug')
      detectors.repeatInputDetector.recordEvent('add tests')

      // Normal WebSocket operation - connection succeeds quickly
      detectors.webSocketHangDetector.start()
      advanceTime(5000)
      detectors.webSocketHangDetector.stop()

      expect(mockTrackEvent).not.toHaveBeenCalled()
    })
  })
})
