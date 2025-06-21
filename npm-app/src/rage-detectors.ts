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
    }),

    webSocketHangDetector: createTimeoutDetector({
      reason: 'websocket_persistent_failure',
      timeoutMs: 60_000,
    }),
  }
}
