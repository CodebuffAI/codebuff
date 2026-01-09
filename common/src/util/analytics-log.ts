import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

// Build PostHog payloads from log data in a single, shared place
export type AnalyticsLogData = {
  eventId?: unknown
  userId?: unknown
  user_id?: unknown
  user?: { id?: unknown }
  [key: string]: unknown
}

export type TrackableAnalyticsPayload = {
  event: AnalyticsEvent
  userId: string
  properties: Record<string, unknown>
}

const analyticsEvents = new Set<AnalyticsEvent>(Object.values(AnalyticsEvent))

const toStringOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null

const getUserId = (
  record: AnalyticsLogData,
  fallbackUserId?: string,
): string | null =>
  toStringOrNull(record.userId) ??
  toStringOrNull(record.user_id) ??
  toStringOrNull(record.user?.id) ??
  toStringOrNull(fallbackUserId)

export function getAnalyticsEventId(data: unknown): AnalyticsEvent | null {
  if (!data || typeof data !== 'object') {
    return null
  }
  const eventId = (data as AnalyticsLogData).eventId
  return analyticsEvents.has(eventId as AnalyticsEvent)
    ? (eventId as AnalyticsEvent)
    : null
}

export function toTrackableAnalyticsPayload({
  data,
  level,
  msg,
  fallbackUserId,
}: {
  data: unknown
  level: string
  msg: string
  fallbackUserId?: string
}): TrackableAnalyticsPayload | null {
  if (!data || typeof data !== 'object') {
    return null
  }

  const record = data as AnalyticsLogData
  const eventId = getAnalyticsEventId(record)
  if (!eventId) {
    return null
  }

  const userId = getUserId(record, fallbackUserId)

  if (!userId) {
    return null
  }

  return {
    event: eventId,
    userId,
    properties: {
      ...record,
      level,
      msg,
    },
  }
}
