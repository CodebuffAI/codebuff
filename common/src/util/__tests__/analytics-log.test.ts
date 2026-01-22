import { describe, expect, it } from 'bun:test'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import {
  getAnalyticsEventId,
  toTrackableAnalyticsPayload,
  type AnalyticsLogData,
} from '../../analytics'

describe('analytics-log helpers', () => {
  const baseMsg = 'hello'
  const baseLevel = 'info'

  it('returns null for non-object data', () => {
    expect(
      toTrackableAnalyticsPayload({ data: null, level: baseLevel, msg: baseMsg }),
    ).toBeNull()
    expect(
      toTrackableAnalyticsPayload({ data: 'x', level: baseLevel, msg: baseMsg }),
    ).toBeNull()
  })

  it('returns null when eventId is missing or unknown', () => {
    expect(
      toTrackableAnalyticsPayload({
        data: {},
        level: baseLevel,
        msg: baseMsg,
      }),
    ).toBeNull()

    expect(
      toTrackableAnalyticsPayload({
        data: { eventId: 'not-real' },
        level: baseLevel,
        msg: baseMsg,
      }),
    ).toBeNull()
  })

  it('returns null when user cannot be resolved', () => {
    expect(
      toTrackableAnalyticsPayload({
        data: { eventId: AnalyticsEvent.AGENT_STEP },
        level: baseLevel,
        msg: baseMsg,
      }),
    ).toBeNull()
  })

  it('builds payload when event and userId exist', () => {
    const payload = toTrackableAnalyticsPayload({
      data: { eventId: AnalyticsEvent.APP_LAUNCHED, userId: 'u1', duration: 123 },
      level: baseLevel,
      msg: baseMsg,
    })!

    expect(payload.event).toBe(AnalyticsEvent.APP_LAUNCHED)
    expect(payload.userId).toBe('u1')
    // Only allowlisted properties are included (userId is extracted separately, not spread)
    expect(payload.properties).toMatchObject({
      eventId: AnalyticsEvent.APP_LAUNCHED,
      duration: 123,
      level: baseLevel,
      msg: baseMsg,
    })
    // PII fields should NOT be in properties
    expect(payload.properties).not.toHaveProperty('userId')
  })

  it('filters out PII and unknown properties', () => {
    const payload = toTrackableAnalyticsPayload({
      data: {
        eventId: AnalyticsEvent.APP_LAUNCHED,
        userId: 'u1',
        email: 'test@example.com',
        password: 'secret',
        unknownField: 'value',
        duration: 500,
        success: true,
      },
      level: baseLevel,
      msg: baseMsg,
    })!

    // Safe properties are included
    expect(payload.properties.duration).toBe(500)
    expect(payload.properties.success).toBe(true)
    expect(payload.properties.eventId).toBe(AnalyticsEvent.APP_LAUNCHED)
    // PII is excluded
    expect(payload.properties).not.toHaveProperty('userId')
    expect(payload.properties).not.toHaveProperty('email')
    expect(payload.properties).not.toHaveProperty('password')
    // Unknown properties are excluded
    expect(payload.properties).not.toHaveProperty('unknownField')
  })

  it('falls back to nested and underscored user ids', () => {
    const fromUser = toTrackableAnalyticsPayload({
      data: { eventId: AnalyticsEvent.APP_LAUNCHED, user: { id: 'nested' } },
      level: baseLevel,
      msg: baseMsg,
    })
    expect(fromUser?.userId).toBe('nested')

    const fromUnderscore = toTrackableAnalyticsPayload({
      data: { eventId: AnalyticsEvent.APP_LAUNCHED, user_id: 'underscored' },
      level: baseLevel,
      msg: baseMsg,
    })
    expect(fromUnderscore?.userId).toBe('underscored')
  })

  it('uses fallbackUserId when no user fields exist', () => {
    const payload = toTrackableAnalyticsPayload({
      data: { eventId: AnalyticsEvent.APP_LAUNCHED },
      level: baseLevel,
      msg: baseMsg,
      fallbackUserId: 'fallback',
    })!

    expect(payload.userId).toBe('fallback')
  })

  it('getAnalyticsEventId returns only known events', () => {
    const data: AnalyticsLogData = { eventId: AnalyticsEvent.APP_LAUNCHED }
    expect(getAnalyticsEventId(data)).toBe(AnalyticsEvent.APP_LAUNCHED)
    expect(getAnalyticsEventId({ eventId: 'nope' })).toBeNull()
    expect(getAnalyticsEventId(null)).toBeNull()
  })
})
