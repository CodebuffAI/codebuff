// @ts-ignore
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { AnalyticsEvent } from 'common/constants/analytics-events'

import { createRageDetectors } from '../rage-detectors'

// Mock the analytics module
const mockTrackEvent = mock(() => {})
mock.module('../utils/analytics', () => ({
  trackEvent: mockTrackEvent,
}))

describe('createRageDetectors', () => {
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
      detectors.keyMashingDetector.recordEvent('d')
    }

    expect(mockTrackEvent).toHaveBeenCalledWith(AnalyticsEvent.RAGE, {
      reason: 'key_mashing',
      count: 5,
      timeWindow: 1000,
      repeatedKey: 'd',
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

  test('webSocketHangDetector should work with realistic scenario', () => {
    const detectors = createRageDetectors()

    // Simulate WebSocket connection hanging
    detectors.webSocketHangDetector.start({
      connectionIssue: 'websocket_persistent_failure',
      url: 'ws://localhost:3000',
    })

    advanceTime(60000) // 60 seconds timeout

    expect(mockTrackEvent).toHaveBeenCalledWith(
      AnalyticsEvent.RAGE,
      expect.objectContaining({
        reason: 'websocket_persistent_failure',
        durationMs: 60000,
        timeoutMs: 60000,
        connectionIssue: 'websocket_persistent_failure',
        url: 'ws://localhost:3000',
      })
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
