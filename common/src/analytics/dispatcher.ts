import type { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import {
  getAnalyticsEventId,
  toTrackableAnalyticsPayload,
  type AnalyticsLogData,
  type TrackableAnalyticsPayload,
} from './log-helpers'

const MAX_BUFFER_SIZE = 100

export type AnalyticsDispatchInput = {
  data: unknown
  level: string
  msg: string
  fallbackUserId?: string
}

export type AnalyticsDispatchPayload = TrackableAnalyticsPayload

/** Runtime-agnostic router for analytics events with dev gating and optional buffering. */
export function createAnalyticsDispatcher({
  envName,
  bufferWhenNoUser = false,
}: {
  envName: string
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
      if (buffered.length >= MAX_BUFFER_SIZE) {
        buffered.shift()
      }
      buffered.push(input)
    }

    return []
  }

  return { process }
}
