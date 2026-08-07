import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { afterEach, describe, expect, mock, test } from 'bun:test'

import {
  initAnalytics,
  resetAnalyticsState,
  trackEvent,
  type AnalyticsDeps,
} from '../analytics'
import { deliverWindowsTerminalFailure } from '../windows-terminal-health'

import type { LogRecordInput } from '@codebuff/common/schemas/logs'

const FAILED_ANALYTICS_DEPS: AnalyticsDeps = {
  env: {},
  isProd: true,
  createClient: mock(() => {
    throw new Error(
      'PostHog client should not be created without configuration',
    )
  }),
  generateAnonymousId: () => 'analytics-anonymous-id',
}

afterEach(() => {
  resetAnalyticsState()
})

describe('Windows terminal-health delivery', () => {
  test('queues and drains the bounded Axiom event when analytics initialization fails', async () => {
    const analyticsRecords: LogRecordInput[] = []
    resetAnalyticsState({
      ...FAILED_ANALYTICS_DEPS,
      enqueueClientLog: (record) => analyticsRecords.push(record),
    })
    expect(() => initAnalytics()).toThrow(
      'NEXT_PUBLIC_POSTHOG_API_KEY or NEXT_PUBLIC_POSTHOG_HOST_URL is not set',
    )
    const fallbackRecords: LogRecordInput[] = []
    const drainClientLogs = mock(async () => {})
    const properties = {
      version: '0.0.142',
      platform: 'win32' as const,
      stage: 'arming' as const,
      failureCode: 'timeout' as const,
    }

    await deliverWindowsTerminalFailure(
      AnalyticsEvent.TERMINAL_WATCHDOG_FAILED,
      properties,
      {
        trackEvent,
        getAnonymousId: () => 'anonymous-install-id',
        enqueueClientLog: (record) => fallbackRecords.push(record),
        drainClientLogs,
      },
    )

    expect(analyticsRecords).toEqual([
      {
        level: 'info',
        event: AnalyticsEvent.TERMINAL_WATCHDOG_FAILED,
        message: AnalyticsEvent.TERMINAL_WATCHDOG_FAILED,
        client_session_id: 'analytics-anonymous-id',
        data: properties,
      },
    ])
    expect(fallbackRecords).toEqual([])
    expect(drainClientLogs).toHaveBeenCalledTimes(1)
  })

  test('preserves the analytics mirror without queuing a duplicate', async () => {
    const tracked = mock(() => {})
    const enqueueClientLog = mock((_record: LogRecordInput) => {})
    const drainClientLogs = mock(async () => {})
    const properties = {
      version: '0.0.142',
      platform: 'win32' as const,
      stage: 'spawn' as const,
      failureCode: 'enoent' as const,
    }

    await deliverWindowsTerminalFailure(
      AnalyticsEvent.TERMINAL_BROKER_SPAWN_FAILED,
      properties,
      {
        trackEvent: tracked,
        getAnonymousId: () => 'unused',
        enqueueClientLog,
        drainClientLogs,
      },
    )

    expect(tracked).toHaveBeenCalledWith(
      AnalyticsEvent.TERMINAL_BROKER_SPAWN_FAILED,
      properties,
    )
    expect(enqueueClientLog).not.toHaveBeenCalled()
    expect(drainClientLogs).toHaveBeenCalledTimes(1)
  })
})
