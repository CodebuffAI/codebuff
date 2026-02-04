
import {
  getAnalyticsEventId,
  toTrackableAnalyticsPayload,
  type AnalyticsLogData,
  type TrackableAnalyticsPayload,
} from './analytics-log'

type EnvName = 'dev' | 'test' | 'prod' | string

export type AnalyticsDispatchInput = {
  data: unknown
  level: string
  msg: string
  fallbackUserId?: string
}

export type AnalyticsDispatchPayload = TrackableAnalyticsPayload

/**
 * Minimal, runtime-agnostic router for analytics events.
 * Handles:
 *  - Dev gating (no-op in dev)
 *  - Optional buffering until a userId is available
 *  - Reusing the shared payload builder for consistency
 */
export function createAnalyticsDispatcher({
  envName,
  bufferWhenNoUser = false,
}: {
  envName: EnvName
  bufferWhenNoUser?: boolean
}) {
  const buffered: AnalyticsDispatchInput[] = []
  const isDevEnv = envName === 'dev'

  function flushBufferWithUser(
    userId: string,
  ): AnalyticsDispatchPayload[] {
    if (!buffered.length) {
      return []
    }

    const toSend: AnalyticsDispatchPayload[] = []
    for (const item of buffered.splice(0)) {
      const rebuilt = toTrackableAnalyticsPayload({
        ...item,
        fallbackUserId: userId,
      })
      if (rebuilt) {
        toSend.push(rebuilt)
      }
    }
    return toSend
  }

  function process(
    input: AnalyticsDispatchInput,
  ): AnalyticsDispatchPayload[] {
    if (isDevEnv) {
      return []
    }

    const payload = toTrackableAnalyticsPayload(input)
    if (payload) {
      const toSend = flushBufferWithUser(payload.userId)
      toSend.push(payload)
      return toSend
    }

    if (
      bufferWhenNoUser &&
      getAnalyticsEventId(input.data as AnalyticsLogData)
    ) {
      buffered.push(input)
    }

    return []
  }

  return { process }
}
