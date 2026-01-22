import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

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

// Allowlist of properties safe to send to analytics.
// Be conservative - only include properties that are clearly non-PII.
const SAFE_ANALYTICS_PROPERTIES = new Set([
  // Event metadata
  'eventId',
  'level',
  'msg',
  // Timing/metrics
  'duration',
  'durationMs',
  'latency',
  'latencyMs',
  'timestamp',
  // Counts/sizes
  'count',
  'size',
  'length',
  'total',
  // Status/type identifiers
  'status',
  'type',
  'action',
  'source',
  'target',
  'category',
  // Agent/model info
  'agentId',
  'agentType',
  'modelId',
  'modelName',
  // Feature flags/versions
  'version',
  'feature',
  'variant',
  // Error info (without stack traces or sensitive details)
  'errorCode',
  'errorType',
  // Boolean flags
  'success',
  'enabled',
  'cached',
  // Run/step identifiers
  'runId',
  'stepNumber',
  'stepId',
])

// Properties that should never be sent to analytics (PII/sensitive)
const BLOCKED_ANALYTICS_PROPERTIES = new Set([
  'userId',
  'user_id',
  'user',
  'email',
  'name',
  'password',
  'token',
  'apiKey',
  'secret',
  'authorization',
  'cookie',
  'session',
  'ip',
  'ipAddress',
  'fingerprint',
  'deviceId',
])

function extractSafeProperties(
  record: AnalyticsLogData,
): Record<string, unknown> {
  const safeProps: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(record)) {
    // Skip blocked properties
    if (BLOCKED_ANALYTICS_PROPERTIES.has(key)) continue
    // Skip complex objects that might contain PII
    if (value !== null && typeof value === 'object') continue
    // Only include properties in the allowlist
    if (SAFE_ANALYTICS_PROPERTIES.has(key)) {
      safeProps[key] = value
    }
  }

  return safeProps
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
      ...extractSafeProperties(record),
      level,
      msg,
    },
  }
}
