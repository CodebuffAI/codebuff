import type { Logger } from './logger'
import type { AnalyticsEvent } from '../../constants/analytics-events'

export type TrackEventFn = (params: {
  event: AnalyticsEvent
  userId: string
  properties?: Record<string, any>
  logger: Logger
}) => void
