import { describe, expect, it } from 'bun:test'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import {
  getAnalyticsEventId,
  toTrackableAnalyticsPayload,
  type AnalyticsLogData,
} from '../analytics-log'

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
      data: { eventId: AnalyticsEvent.APP_LAUNCHED, userId: 'u1', extra: 123 },
      level: baseLevel,
      msg: baseMsg,
    })!

    expect(payload.event).toBe(AnalyticsEvent.APP_LAUNCHED)
    expect(payload.userId).toBe('u1')
    expect(payload.properties).toMatchObject({
      userId: 'u1',
      extra: 123,
      level: baseLevel,
      msg: baseMsg,
    })
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
