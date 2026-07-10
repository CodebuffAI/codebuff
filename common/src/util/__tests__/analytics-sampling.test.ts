import { afterEach, describe, expect, it } from 'bun:test'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import {
  isFullTelemetryEnabled,
  shouldTrackAnalyticsEvent,
  summarizeAnalyticsValue,
} from '../analytics-sampling'

const ORIGINAL_ENV = {
  CODEBUFF_FULL_TELEMETRY: process.env.CODEBUFF_FULL_TELEMETRY,
  CODEBUFF_FULL_TELEMETRY_IDS: process.env.CODEBUFF_FULL_TELEMETRY_IDS,
  CODEBUFF_FULL_TELEMETRY_USER_IDS:
    process.env.CODEBUFF_FULL_TELEMETRY_USER_IDS,
}

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

describe('analytics sampling', () => {
  afterEach(() => {
    restoreEnv()
  })

  it('always tracks core CLI lifecycle events', () => {
    expect(
      shouldTrackAnalyticsEvent({
        event: AnalyticsEvent.APP_LAUNCHED,
        distinctId: 'user-1',
      }),
    ).toBe(true)
    expect(
      shouldTrackAnalyticsEvent({
        event: AnalyticsEvent.USER_INPUT_COMPLETE,
        distinctId: 'user-1',
      }),
    ).toBe(true)
  })

  it('always tracks CLI error logs', () => {
    expect(
      shouldTrackAnalyticsEvent({
        event: AnalyticsEvent.CLI_LOG,
        distinctId: 'user-1',
        properties: { level: 'error' },
      }),
    ).toBe(true)
  })

  it('samples high-volume events deterministically', () => {
    const first = shouldTrackAnalyticsEvent({
      event: AnalyticsEvent.TOOL_USE,
      distinctId: 'user-1',
    })
    const second = shouldTrackAnalyticsEvent({
      event: AnalyticsEvent.TOOL_USE,
      distinctId: 'user-1',
    })
    const otherEvent = shouldTrackAnalyticsEvent({
      event: AnalyticsEvent.AGENT_STEP,
      distinctId: 'user-1',
    })

    expect(second).toBe(first)
    expect(typeof otherEvent).toBe('boolean')
  })

  it('samples inline ad slot demand instead of ingesting every slot', () => {
    const decisions = Array.from({ length: 1_000 }, (_, i) =>
      shouldTrackAnalyticsEvent({
        event: AnalyticsEvent.CLI_INLINE_AD_SLOT_ELIGIBLE,
        distinctId: `inline-ad-user-${i}`,
      }),
    )

    expect(decisions).toContain(true)
    expect(decisions).toContain(false)
  })

  it('honors full telemetry env flags and allowlists', () => {
    process.env.CODEBUFF_FULL_TELEMETRY = 'true'
    expect(
      isFullTelemetryEnabled({
        distinctId: 'anyone',
      }),
    ).toBe(true)

    delete process.env.CODEBUFF_FULL_TELEMETRY
    process.env.CODEBUFF_FULL_TELEMETRY_IDS = 'user-2,person@example.com'

    expect(
      isFullTelemetryEnabled({
        distinctId: 'user-2',
      }),
    ).toBe(true)
    expect(
      isFullTelemetryEnabled({
        properties: { userEmail: 'person@example.com' },
      }),
    ).toBe(true)
    expect(
      isFullTelemetryEnabled({
        distinctId: 'user-3',
      }),
    ).toBe(false)
  })

  it('summarizes values without retaining raw contents', () => {
    expect(summarizeAnalyticsValue('secret text')).toEqual({
      kind: 'string',
      length: 11,
    })
    expect(summarizeAnalyticsValue(['a', 'b'])).toEqual({
      kind: 'array',
      length: 2,
    })
    expect(summarizeAnalyticsValue({ prompt: 'secret', count: 1 })).toEqual({
      kind: 'object',
      keyCount: 2,
      keys: ['prompt', 'count'],
    })
  })
})
