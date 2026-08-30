import { describe, expect, test } from 'bun:test'

import { AnalyticsEvent } from '../../constants/analytics-events'
import { buildLogRows } from '../log-ingest'

const base = {
  source: 'cli' as const,
  service: 'web',
  env: 'test',
  userId: 'authenticated-user',
  now: new Date('2026-08-25T00:00:00.000Z'),
}

const acknowledgement = {
  surface: 'waiting_room',
  placement_id: 'waiting-room-1',
  outcome: 'accepted',
  attempt: 1,
  duration_ms: 250,
  client_family: 'cli',
}

describe('buildLogRows', () => {
  test('accepts only the exact view acknowledgement payload, clears every identity field, and uses server receive time', () => {
    const [row] = buildLogRows({
      ...base,
      records: [
        {
          level: 'info',
          event: AnalyticsEvent.ADS_FIRST_PARTY_VIEW_ACK,
          timestamp: '2099-01-01T00:00:00.000Z',
          message: 'private message must not persist',
          client_session_id: 'private-session',
          client_request_id: 'private-request',
          fingerprint_id: 'private-fingerprint',
          data: acknowledgement,
        },
      ],
    })
    expect(row).toMatchObject({
      event: AnalyticsEvent.ADS_FIRST_PARTY_VIEW_ACK,
      message: null,
      user_id: null,
      client_session_id: null,
      client_request_id: null,
      fingerprint_id: null,
      timestamp: base.now,
      data: acknowledgement,
    })
  })

  test('drops malformed/private acknowledgement events instead of retaining a count', () => {
    const rows = buildLogRows({
      ...base,
      records: [
        {
          level: 'info',
          event: AnalyticsEvent.ADS_FIRST_PARTY_VIEW_ACK,
          data: { ...acknowledgement, token: 'private-token' },
        },
        {
          level: 'info',
          event: AnalyticsEvent.ADS_FIRST_PARTY_VIEW_ACK,
          data: { ...acknowledgement, error: { raw: 'private' } },
        },
        {
          level: 'info',
          event: AnalyticsEvent.ADS_FIRST_PARTY_VIEW_ACK,
          data: { ...acknowledgement, placement_id: 'unknown' },
        },
      ],
    })
    expect(rows).toEqual([])
  })

  test('leaves ordinary client records unchanged', () => {
    const [row] = buildLogRows({
      ...base,
      records: [
        {
          level: 'info',
          event: 'ordinary.event',
          message: 'ordinary message',
          client_session_id: 'session',
          data: { private: 'ordinary records retain normal behavior' },
        },
      ],
    })
    expect(row).toMatchObject({
      event: 'ordinary.event',
      message: 'ordinary message',
      user_id: 'authenticated-user',
      client_session_id: 'session',
      data: { private: 'ordinary records retain normal behavior' },
    })
  })
})
