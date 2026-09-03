import { describe, expect, test } from 'bun:test'

import {
  AD_EVENT_SAMPLE_RATE,
  clampRenderDelayMs,
  clientFamilyFromUserAgent,
  readClientEventId,
  readRenderDelayMs,
  RENDER_DELAY_MAX_MS,
} from './ad-event-hygiene'

describe('clampRenderDelayMs', () => {
  test('clamps to [0, one day] and never rejects (AC3)', () => {
    expect(clampRenderDelayMs(1234)).toBe(1234)
    expect(clampRenderDelayMs(-5)).toBe(0)
    expect(clampRenderDelayMs(9e9)).toBe(RENDER_DELAY_MAX_MS)
    expect(clampRenderDelayMs('250')).toBe(250)
    expect(clampRenderDelayMs(12.6)).toBe(13)
  })

  test('absent, malformed and non-finite are all UNKNOWN', () => {
    for (const value of [undefined, null, '', 'soon', NaN, Infinity, {}, []]) {
      expect(clampRenderDelayMs(value)).toBeNull()
    }
    expect(readRenderDelayMs(undefined, 'x', 42)).toBe(42)
    expect(readRenderDelayMs(undefined, null)).toBeNull()
  })
})

describe('readClientEventId', () => {
  test('takes the first bounded printable candidate, header before body', () => {
    const uuid = '123e4567-e89b-42d3-a456-426614174000'
    expect(readClientEventId(uuid, 'body-id')).toBe(uuid)
    expect(readClientEventId(null, 'body-id')).toBe('body-id')
    expect(readClientEventId(undefined, undefined)).toBeNull()
  })

  test('refuses anything it would have to parse', () => {
    expect(readClientEventId('')).toBeNull()
    expect(readClientEventId('a'.repeat(129))).toBeNull()
    expect(readClientEventId('has space')).toBeNull()
    expect(readClientEventId('{"json":1}')).toBeNull()
    expect(readClientEventId(42)).toBeNull()
  })
})

describe('clientFamilyFromUserAgent', () => {
  test('classifies our clients by product token and browsers as web', () => {
    expect(clientFamilyFromUserAgent('Freebuff-CLI/1.2.3')).toBe('cli')
    expect(clientFamilyFromUserAgent('codebuff-cli/0.9')).toBe('cli')
    expect(clientFamilyFromUserAgent('Freebuff-Desktop/2.0 (darwin)')).toBe(
      'desktop',
    )
    expect(
      clientFamilyFromUserAgent('Mozilla/5.0 (Macintosh) AppleWebKit/537.36'),
    ).toBe('web')
  })

  test('never guesses', () => {
    expect(clientFamilyFromUserAgent(null)).toBe('unknown')
    expect(clientFamilyFromUserAgent('')).toBe('unknown')
    expect(clientFamilyFromUserAgent('curl/8.0')).toBe('unknown')
  })
})

test('the sample rate is the integer 1 until something actually samples', () => {
  expect(AD_EVENT_SAMPLE_RATE).toBe(1)
})
