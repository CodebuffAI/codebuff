import { sleep } from '@codebuff/common/util/promise'
import type { WebSocket } from 'bun'

import {
  createCountDetector,
  createTimeBetweenDetector,
  createTimeoutDetector,
} from './utils/rage-detector'

import type { ReadyState } from '@codebuff/common/websockets/websocket-client'

export interface RageDetectors {
  keyMashingDetector: ReturnType<typeof createCountDetector>
  repeatInputDetector: ReturnType<typeof createCountDetector>
  exitAfterErrorDetector: ReturnType<typeof createTimeBetweenDetector>
  webSocketHangDetector: ReturnType<
    typeof createTimeoutDetector<WebSocketHangDetectorContext>
  >
  startupTimeDetector: ReturnType<typeof createTimeBetweenDetector>
  exitTimeDetector: ReturnType<typeof createTimeBetweenDetector>
}

// Define the specific context type for WebSocket hang detector
interface WebSocketHangDetectorContext {
  connectionIssue?: string
  url?: string
  getWebsocketState: () => ReadyState
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
      filter: ({ str, key }) => {
        // Skip modifier keys and special keys
        const isModifier = key?.meta || key?.alt || key?.shift
        const isSpecialKey =
          key?.name === 'backspace' ||
          key?.name === 'space' ||
          key?.name === 'enter' ||
          key?.name === 'tab'

        // Ignore the following:
        if (isModifier || isSpecialKey || !key?.name) {
          return false
        }
        if (key?.ctrl && key?.name === 'w') {
          return false
        }

        // Count the following:
        if (key?.ctrl && key?.name === 'c') {
          return true
        }

        return true
      },
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

    webSocketHangDetector: createTimeoutDetector<WebSocketHangDetectorContext>({
      reason: 'websocket_persistent_failure',
      timeoutMs: 60_000,
      shouldFire: async (context) => {
        if (!context || !context.getWebsocketState) {
          return false
        }

        // Add a 2-second grace period for reconnection
        await sleep(2000)

        // Only fire if the websocket is still not connected.
        // This prevents firing if the connection is restored right before the timeout.
        return context.getWebsocketState() !== WebSocket.OPEN
      },
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
