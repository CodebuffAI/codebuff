import { describe, expect, test } from 'bun:test'

import {
  ADS_BREAK_CLICKED_EVENT,
  ADS_BREAK_CLOSED_EVENT,
  ADS_BREAK_SHOWN_EVENT,
  buildSponsorBreakEvent,
  clampDwellMs,
  isSponsorBreakCloseMethod,
  readDwellMs,
  SPONSOR_BREAK_ACCIDENTAL_CLICK_MS,
  SPONSOR_BREAK_CLOSE_METHODS,
  SPONSOR_BREAK_DWELL_MAX_MS,
} from '../sponsor-break-events'

import {
  ADS_CLIENT_EVENT_HYGIENE_FIELDS,
  ADS_SPONSOR_BREAK_FIELD_NAMES,
  getAxiomOnlyLogEvent,
} from '../../util/axiom-only-log'

/**
 * COD-453 item 6. Two things are guarded here: the payload builder is TOTAL
 * (nothing a renderer sends can throw or reject), and the Axiom allowlist
 * discards everything not on the contract -- these events are emitted from
 * clients, so the allowlist is the only fence between a renderer and the
 * dataset.
 */
describe('the break close vocabulary', () => {
  test('is closed, and rejects anything outside it', () => {
    for (const method of SPONSOR_BREAK_CLOSE_METHODS) {
      expect(isSponsorBreakCloseMethod(method)).toBe(true)
    }
    for (const value of ['dismiss', 'X', '', null, undefined, 3, {}]) {
      expect(isSponsorBreakCloseMethod(value)).toBe(false)
    }
  })

  /**
   * `escape` is deliberately not pooled with `x`: one is a considered exit and
   * one is a reflex, and telling them apart is how a format learns whether it
   * is being read or swatted.
   */
  test('keeps the reflex exits separate from the considered ones', () => {
    expect(SPONSOR_BREAK_CLOSE_METHODS).toContain('x')
    expect(SPONSOR_BREAK_CLOSE_METHODS).toContain('escape')
    expect(SPONSOR_BREAK_CLOSE_METHODS).toContain('continue')
    expect(SPONSOR_BREAK_CLOSE_METHODS).toContain('timer_then_continue')
    expect(SPONSOR_BREAK_CLOSE_METHODS).toContain('thread_switch')
  })
})

describe('clampDwellMs', () => {
  test('clamps rather than rejecting, exactly like the render delay', () => {
    expect(clampDwellMs(-5)).toBe(0)
    expect(clampDwellMs(0)).toBe(0)
    expect(clampDwellMs(1234.6)).toBe(1235)
    expect(clampDwellMs('2000')).toBe(2000)
    expect(clampDwellMs(9e9)).toBe(SPONSOR_BREAK_DWELL_MAX_MS)
  })

  /**
   * Absent and unparseable are DELIBERATELY the same value, so nothing
   * downstream can reconstruct a dwell from timestamps to fill the gap.
   */
  test('unknown is null, and is indistinguishable from absent', () => {
    for (const value of [
      undefined,
      null,
      '',
      '   ',
      'abc',
      {},
      NaN,
      Infinity,
    ]) {
      expect(clampDwellMs(value)).toBeNull()
    }
    expect(readDwellMs(undefined, null, 'abc')).toBeNull()
  })

  test('reads the first candidate that clamps, so a header wins over a body', () => {
    expect(readDwellMs('900', 100)).toBe(900)
    expect(readDwellMs(null, 100)).toBe(100)
  })

  /**
   * A one-hour ceiling rather than the render delay's day: a dwell of hours is
   * a laptop that slept with the break open, which is real and common and
   * whose value is meaningless. Clamping keeps the row in the denominator
   * while stopping one suspended machine from owning the p90.
   */
  test('the dwell ceiling is far tighter than the render-delay ceiling', () => {
    expect(SPONSOR_BREAK_DWELL_MAX_MS).toBe(3_600_000)
    expect(SPONSOR_BREAK_ACCIDENTAL_CLICK_MS).toBe(300)
  })
})

describe('buildSponsorBreakEvent', () => {
  const base = {
    placementId: 'Desktop-Spotlight',
    surface: 'cli_chat',
    format: 'spotlight',
    arm: 'reduced_spotlight',
  }

  test('drops every unknown optional rather than emitting a sentinel', () => {
    expect(buildSponsorBreakEvent(base)).toEqual({
      placement_id: 'Desktop-Spotlight',
      surface: 'cli_chat',
      format: 'spotlight',
      sponsor_break_arm: 'reduced_spotlight',
      sample_rate: 1,
    })
  })

  test('carries a full close event', () => {
    expect(
      buildSponsorBreakEvent({
        ...base,
        method: 'timer_then_continue',
        dwellMs: 4200,
        timerMs: 3000,
        timerCompleted: true,
        clientEventId: 'evt-123',
        clientFamily: 'desktop',
        campaignLabel: 'pilot-b',
        creativeVersion: 3,
        opportunityId: 'opp_1',
      }),
    ).toEqual({
      placement_id: 'Desktop-Spotlight',
      surface: 'cli_chat',
      format: 'spotlight',
      sponsor_break_arm: 'reduced_spotlight',
      campaign_label: 'pilot-b',
      creative_version: 3,
      opportunity_id: 'opp_1',
      method: 'timer_then_continue',
      dwell_ms: 4200,
      timer_ms: 3000,
      timer_completed: true,
      client_event_id: 'evt-123',
      client_family: 'desktop',
      sample_rate: 1,
    })
  })

  test('the dismiss lock rides the close event, and 0 survives (COD-454)', () => {
    // `dismiss_lock_ms` is a DIFFERENT field from `timer_ms` because the two
    // hold different things — the countdown gates the whole card, the lock
    // only the ways out — so a readout must be able to tell them apart without
    // joining on the format.
    expect(
      buildSponsorBreakEvent({
        ...base,
        method: 'click',
        dismissLockMs: 5000,
        lockCompleted: false,
      }),
    ).toMatchObject({ dismiss_lock_ms: 5000, lock_completed: false })
    // ZERO IS A VALUE, not an absence: it is the lock's rollback, and a row
    // that dropped it would be indistinguishable from an older client that
    // never had a lock at all.
    expect(
      buildSponsorBreakEvent({
        ...base,
        dismissLockMs: 0,
        lockCompleted: true,
      }),
    ).toMatchObject({ dismiss_lock_ms: 0, lock_completed: true })
  })

  test('a renderer that predates the lock emits exactly as it does today', () => {
    // The `ad-event-hygiene` rule: every optional field degrades to ABSENT.
    const built = buildSponsorBreakEvent({ ...base, method: 'x' })
    expect(built).not.toHaveProperty('dismiss_lock_ms')
    expect(built).not.toHaveProperty('lock_completed')
    // And a nonsense value is absent rather than emitted raw.
    const junk = buildSponsorBreakEvent({
      ...base,
      dismissLockMs: 'soon',
      lockCompleted: 'yes',
    })
    expect(junk).not.toHaveProperty('dismiss_lock_ms')
    expect(junk).not.toHaveProperty('lock_completed')
  })

  test('a malformed method or event id is dropped, never emitted raw', () => {
    const built = buildSponsorBreakEvent({
      ...base,
      method: 'made-up',
      clientEventId: 'has spaces and is not a token',
      dwellMs: 'nope',
    })
    expect(built.method).toBeUndefined()
    expect(built.client_event_id).toBeUndefined()
    expect(built.dwell_ms).toBeUndefined()
  })
})

describe('the Axiom allowlist', () => {
  const events = [
    ADS_BREAK_SHOWN_EVENT,
    ADS_BREAK_CLOSED_EVENT,
    ADS_BREAK_CLICKED_EVENT,
  ] as const

  test('keeps the contract and discards everything else', () => {
    for (const axiomEvent of events) {
      expect(
        getAxiomOnlyLogEvent({
          axiomEvent,
          placement_id: 'Desktop-Intermission',
          surface: 'cli_chat',
          format: 'intermission',
          sponsor_break_arm: 'reduced_intermission',
          dwell_ms: 5000,
          method: 'continue',
          client_family: 'desktop',
          sample_rate: 1,
          // None of these may ship: an id, a url, and free copy.
          campaign_id: 'camp_secret',
          userId: 'user-123',
          landing_url: 'https://advertiser.example',
          title: 'Buy our thing',
        }),
      ).toEqual({
        event: axiomEvent,
        data: {
          placement_id: 'Desktop-Intermission',
          surface: 'cli_chat',
          format: 'intermission',
          sponsor_break_arm: 'reduced_intermission',
          dwell_ms: 5000,
          method: 'continue',
          client_family: 'desktop',
          sample_rate: 1,
        },
      })
    }
  })

  test('CI guard: the break allowlist carries the client hygiene fields', () => {
    for (const field of ADS_CLIENT_EVENT_HYGIENE_FIELDS) {
      expect(ADS_SPONSOR_BREAK_FIELD_NAMES).toContain(field)
    }
  })
})
