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
  const eventId = record.eventId

  if (!eventId || !analyticsEvents.has(eventId as AnalyticsEvent)) {
    return null
  }

  const userId =
    toStringOrNull(record.userId) ??
    toStringOrNull(record.user_id) ??
    toStringOrNull(record.user?.id) ??
    toStringOrNull(fallbackUserId)

  if (!userId) {
    return null
  }

  return {
    event: eventId as AnalyticsEvent,
    userId,
    properties: {
      ...record,
      level,
      msg,
    },
  }
}
