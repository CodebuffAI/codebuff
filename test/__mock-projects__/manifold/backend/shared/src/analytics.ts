import * as Amplitude from '@amplitude/node'
import { Request } from 'express'

import { DEV_CONFIG } from 'common/envs/dev'
import { PROD_CONFIG } from 'common/envs/prod'
import { tryOrLogError } from 'shared/helpers/try-or-log-error'

import { isProd } from 'shared/utils'
import { trackAuditEvent } from 'shared/audit-events'

const key = isProd() ? PROD_CONFIG.amplitudeApiKey : DEV_CONFIG.amplitudeApiKey

const amp = Amplitude.init(key ?? '')

export const track = async (
  userId: string,
  eventName: string,
  eventProperties?: any,
  amplitudeProperties?: Partial<Amplitude.Event>
) => {
  return await tryOrLogError(
    amp.logEvent({
      event_type: eventName,
      user_id: userId,
      event_properties: eventProperties,
      ...amplitudeProperties,
    })
  )
}
export const trackPublicEvent = async (
  userId: string,
  eventName: string,
  eventProperties?: any,
  amplitudeProperties?: Partial<Amplitude.Event>
) => {
  const allProperties = Object.assign(eventProperties ?? {}, {})
  const { contractId, commentId, ...data } = allProperties
  return await tryOrLogError(
    Promise.all([
      amp.logEvent({
        event_type: eventName,
        user_id: userId,
        event_properties: eventProperties,
        ...amplitudeProperties,
      }),
      trackAuditEvent(userId, eventName, contractId, commentId, data),
    ])
  )
}

export const getIp = (req: Request) => {
  const xForwarded = req.headers['x-forwarded-for']
  const xForwardedIp = Array.isArray(xForwarded) ? xForwarded[0] : xForwarded

  return xForwardedIp ?? req.socket.remoteAddress ?? req.ip
}
