import {
  createCountDetector,
  createTimeBetweenDetector,
  createTimeoutDetector,
} from './utils/rage-detector'

export interface RageDetectors {
  keyMashingDetector: ReturnType<typeof createCountDetector>
  repeatInputDetector: ReturnType<typeof createCountDetector>
  exitAfterErrorDetector: ReturnType<typeof createTimeBetweenDetector>
  webSocketHangDetector: ReturnType<typeof createTimeoutDetector>
  startupTimeDetector: ReturnType<typeof createTimeBetweenDetector>
  exitTimeDetector: ReturnType<typeof createTimeBetweenDetector>
}

export function createRageDetectors(): RageDetectors {
  return {
    keyMashingDetector: createCountDetector({
      reason: 'key_mashing',
      mode: 'COUNT',
      threshold: 5,
      timeWindow: 1000,
      historyLimit: 20,
      debounceMs: 5_000,
    }),

    repeatInputDetector: createCountDetector({
      reason: 'repeat_input',
      mode: 'COUNT',
      threshold: 3,
      timeWindow: 30_000,
      historyLimit: 10,
      debounceMs: 10_000,
    }),

    exitAfterErrorDetector: createTimeBetweenDetector({
      reason: 'exit_after_error',
      mode: 'TIME_BETWEEN',
      threshold: 10_000,
      operator: 'lt',
    }),

    webSocketHangDetector: createTimeoutDetector({
      reason: 'websocket_persistent_failure',
      timeoutMs: 60_000,
    }),

    startupTimeDetector: createTimeBetweenDetector({
      reason: 'slow_startup',
      mode: 'TIME_BETWEEN',
      threshold: 5_000,
      operator: 'gte',
      debounceMs: 30_000,
    }),

    exitTimeDetector: createTimeBetweenDetector({
      reason: 'slow_exit',
      mode: 'TIME_BETWEEN',
      threshold: 10_000,
      operator: 'gte',
      debounceMs: 30_000,
    }),
  }
}

/**
 * Global singleton instance of rage detectors.
 * This allows rage detection to be used anywhere in the application.
 */
export const rageDetectors: RageDetectors = createRageDetectors()
