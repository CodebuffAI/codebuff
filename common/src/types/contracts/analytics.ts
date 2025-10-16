import type { AnalyticsEvent } from '../../constants/analytics-events'
import type { Logger } from './logger'

export type TrackEventFn = (params: {
  event: AnalyticsEvent
  userId: string
  properties?: Record<string, any>
  logger: Logger
}) => void
