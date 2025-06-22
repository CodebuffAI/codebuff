import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import { trackEvent } from './analytics'

type EventRecord = { timestamp: number; value: any }

// Base interface for options
interface BaseDetectorOptions {
  reason: string
  debounceMs?: number
}

interface CountDetectorOptions extends BaseDetectorOptions {
  mode: 'COUNT'
  threshold: number
  timeWindow: number
  historyLimit: number
}

interface TimeBetweenDetectorOptions extends BaseDetectorOptions {
  mode: 'TIME_BETWEEN'
  threshold: number
  operator: 'lt' | 'gt' | 'eq' | 'gte' | 'lte'
}

interface RateDetectorOptions extends BaseDetectorOptions {
  mode: 'RATE'
  baselineWindow: number // Time window to establish baseline rate
  detectionWindow: number // Time window to detect rate changes
  rateMultiplier: number // How many times faster than baseline triggers detection
  minEvents: number // Minimum events needed to establish baseline
}

interface SequenceDetectorOptions extends BaseDetectorOptions {
  mode: 'SEQUENCE'
  pattern: string[] // Sequence of event types to match
  maxGapMs: number // Maximum time between events in sequence
  allowPartialRepeats: boolean // Whether to detect partial pattern repeats
}

type DetectorOptions =
  | CountDetectorOptions
  | TimeBetweenDetectorOptions
  | RateDetectorOptions
  | SequenceDetectorOptions

// Factory function for COUNT-based detectors
export function createCountDetector(options: CountDetectorOptions) {
  let history: EventRecord[] = []
  let debounceTimer: NodeJS.Timeout | null = null

  const recordEvent = (value?: any) => {
    const now = Date.now()
    history.push({ timestamp: now, value })

    // Trim history to prevent memory leaks
    if (history.length > options.historyLimit) {
      history.shift()
    }

    checkForRage()
  }

  const checkForRage = () => {
    const now = Date.now()

    const recentEvents = history.filter(
      (event) => now - event.timestamp <= options.timeWindow
    )

    if (recentEvents.length < options.threshold) {
      return
    }

    // Check for consecutive repeats of the same value
    let repeatCount = 1
    let lastValue = null
    let repeatedEvents: EventRecord[] = []

    for (const event of recentEvents) {
      if (event.value === lastValue) {
        repeatCount++
        repeatedEvents.push(event)
      } else {
        repeatCount = 1
        repeatedEvents = [event]
      }

      if (repeatCount >= options.threshold) {
        fireEvent(repeatedEvents)
        return
      }

      lastValue = event.value
    }
  }

  const fireEvent = (events: EventRecord[]) => {
    if (debounceTimer) return // Debounce active

    trackEvent(AnalyticsEvent.RAGE, {
      reason: options.reason,
      count: events.length,
      timeWindow: options.timeWindow,
      repeatedKey: events[0]?.value,
    })

    history = [] // Clear history to prevent immediate re-firing

    if (options.debounceMs) {
      debounceTimer = setTimeout(() => {
        debounceTimer = null
      }, options.debounceMs)
    }
  }

  return { recordEvent }
}

// Factory function for TIME_BETWEEN-based detectors
export function createTimeBetweenDetector(options: TimeBetweenDetectorOptions) {
  let startEvent: EventRecord | null = null
  let coolDownTimer: NodeJS.Timeout | null = null

  const start = () => {
    startEvent = { timestamp: Date.now(), value: null }
  }

  const end = () => {
    if (!startEvent || coolDownTimer) return

    const duration = Date.now() - startEvent.timestamp
    const operator = options.operator || 'lt' // Default to lt for backward compatibility

    let shouldFire = false
    switch (operator) {
      case 'lt':
        shouldFire = duration < options.threshold
        break
      case 'gt':
        shouldFire = duration > options.threshold
        break
      case 'eq':
        shouldFire = duration === options.threshold
        break
      case 'gte':
        shouldFire = duration >= options.threshold
        break
      case 'lte':
        shouldFire = duration <= options.threshold
        break
    }

    if (shouldFire) {
      fireEvent(duration)
    }
    startEvent = null
  }

  const fireEvent = (duration: number) => {
    trackEvent(AnalyticsEvent.RAGE, {
      reason: options.reason,
      duration,
      threshold: options.threshold,
      operator: options.operator,
    })

    if (options.debounceMs) {
      coolDownTimer = setTimeout(() => {
        coolDownTimer = null
      }, options.debounceMs)
    }
  }

  return { start, end }
}

// Factory function for TIMEOUT-based detectors
export function createTimeoutDetector(options: {
  reason: string
  timeoutMs: number
  onHang?: () => void // Optional callback
  context?: Record<string, any>
}) {
  let timeoutHandle: NodeJS.Timeout | null = null

  const start = (context?: Record<string, any>) => {
    stop() // Clear any existing timeout

    const startTime = Date.now()
    timeoutHandle = setTimeout(() => {
      const duration = Date.now() - startTime
      trackEvent(AnalyticsEvent.RAGE, {
        reason: options.reason,
        durationMs: duration,
        timeoutMs: options.timeoutMs,
        ...options.context,
        ...context,
      })
      if (options.onHang) {
        options.onHang()
      }
    }, options.timeoutMs)
  }

  const stop = () => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
      timeoutHandle = null
    }
  }

  return { start, stop }
}
