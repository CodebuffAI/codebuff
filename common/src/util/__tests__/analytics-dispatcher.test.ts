import { describe, expect, it } from 'bun:test'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import { createAnalyticsDispatcher } from '../../analytics'

describe('analytics dispatcher', () => {
  const level = 'info'
  const msg = 'hello'

  it('no-ops in dev environment', () => {
    const dispatcher = createAnalyticsDispatcher({
      envName: 'dev',
      bufferWhenNoUser: true,
    })

    const out = dispatcher.process({
      data: { eventId: AnalyticsEvent.APP_LAUNCHED, userId: 'u' },
      level,
      msg,
    })

    expect(out).toEqual([])
  })

  it('emits payload when event and user are present', () => {
    const dispatcher = createAnalyticsDispatcher({ envName: 'prod' })

    const out = dispatcher.process({
      data: { eventId: AnalyticsEvent.APP_LAUNCHED, userId: 'u' },
      level,
      msg,
    })

    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      event: AnalyticsEvent.APP_LAUNCHED,
      userId: 'u',
      properties: expect.objectContaining({
        eventId: AnalyticsEvent.APP_LAUNCHED,
        level,
        msg,
      }),
    })
    // PII fields should NOT be in properties (security fix)
    expect(out[0].properties).not.toHaveProperty('userId')
  })

  it('buffers when no user and flushes once user appears', () => {
    const dispatcher = createAnalyticsDispatcher({
      envName: 'prod',
      bufferWhenNoUser: true,
    })

    // Missing user; should buffer
    const first = dispatcher.process({
      data: { eventId: AnalyticsEvent.APP_LAUNCHED },
      level,
      msg,
    })
    expect(first).toEqual([])

    // With user; should flush buffered event first, then this one
    const second = dispatcher.process({
      data: {
        eventId: AnalyticsEvent.AGENT_STEP,
        userId: 'user-1',
      },
      level,
      msg,
    })

    expect(second).toHaveLength(2)
    expect(second[0]).toMatchObject({
      event: AnalyticsEvent.APP_LAUNCHED,
      userId: 'user-1',
    })
    expect(second[1]).toMatchObject({
      event: AnalyticsEvent.AGENT_STEP,
      userId: 'user-1',
    })
  })

  it('uses fallbackUserId when rebuilding buffered events', () => {
    const dispatcher = createAnalyticsDispatcher({
      envName: 'prod',
      bufferWhenNoUser: true,
    })

    dispatcher.process({
      data: { eventId: AnalyticsEvent.APP_LAUNCHED },
      level,
      msg,
    })

    const out = dispatcher.process({
      data: {
        eventId: AnalyticsEvent.AGENT_STEP,
      },
      level,
      msg,
      fallbackUserId: 'fallback-user',
    })

    expect(out).toHaveLength(2)
    expect(out[0].userId).toBe('fallback-user')
    expect(out[1].userId).toBe('fallback-user')
  })

  it('ignores unknown events even when buffering is on', () => {
    const dispatcher = createAnalyticsDispatcher({
      envName: 'prod',
      bufferWhenNoUser: true,
    })

    const out = dispatcher.process({
      data: { eventId: 'not-real' },
      level,
      msg,
    })

    expect(out).toEqual([])
  })
})
