import { describe, expect, it } from 'bun:test'

import {
  queueTimeMsFromHeaders,
  requestContentBytesFromHeaders,
} from '../request-queue-time'

const headers = (map: Record<string, string>) => ({
  get: (name: string): string | null => map[name.toLowerCase()] ?? null,
})

describe('queueTimeMsFromHeaders', () => {
  it('returns undefined when the header is absent', () => {
    expect(queueTimeMsFromHeaders(headers({}))).toBeUndefined()
  })

  it('parses a millisecond epoch and yields a small positive wait', () => {
    const ms = Date.now() - 250
    const queue = queueTimeMsFromHeaders(
      headers({ 'x-request-start': String(ms) }),
    )
    expect(queue).toBeGreaterThanOrEqual(240)
    expect(queue).toBeLessThan(2000)
  })

  it('parses the nginx "t=<seconds>" fractional form', () => {
    const secs = (Date.now() - 500) / 1000
    const queue = queueTimeMsFromHeaders(
      headers({ 'x-request-start': `t=${secs.toFixed(3)}` }),
    )
    expect(queue).toBeGreaterThanOrEqual(490)
    expect(queue).toBeLessThan(2000)
  })

  it('parses a nanosecond epoch', () => {
    const ns = (Date.now() - 100) * 1e6
    const queue = queueTimeMsFromHeaders(
      headers({ 'x-request-start': String(ns) }),
    )
    expect(queue).toBeGreaterThanOrEqual(90)
    expect(queue).toBeLessThan(2000)
  })

  it('drops future timestamps (negative) and garbage', () => {
    const future = Date.now() + 60_000
    expect(
      queueTimeMsFromHeaders(headers({ 'x-request-start': String(future) })),
    ).toBeUndefined()
    expect(
      queueTimeMsFromHeaders(headers({ 'x-request-start': 'not-a-number' })),
    ).toBeUndefined()
  })

  it('drops implausibly large waits (>10min)', () => {
    const ancient = Date.now() - 20 * 60 * 1000
    expect(
      queueTimeMsFromHeaders(headers({ 'x-request-start': String(ancient) })),
    ).toBeUndefined()
  })
})

describe('requestContentBytesFromHeaders', () => {
  it('returns undefined when Content-Length is absent (e.g. chunked)', () => {
    expect(requestContentBytesFromHeaders(headers({}))).toBeUndefined()
  })

  it('parses a valid Content-Length', () => {
    expect(
      requestContentBytesFromHeaders(headers({ 'content-length': '4096' })),
    ).toBe(4096)
  })

  it('accepts zero-length bodies', () => {
    expect(
      requestContentBytesFromHeaders(headers({ 'content-length': '0' })),
    ).toBe(0)
  })

  it('rejects negative or non-numeric values', () => {
    expect(
      requestContentBytesFromHeaders(headers({ 'content-length': '-1' })),
    ).toBeUndefined()
    expect(
      requestContentBytesFromHeaders(headers({ 'content-length': 'abc' })),
    ).toBeUndefined()
  })

  it('rejects partial-parseable garbage instead of truncating it', () => {
    // parseInt would return 0 / 1 / 123 for these; we require pure digits.
    for (const bad of ['0x10', '1e6', '123abc', '4.5', ' 12 3']) {
      expect(
        requestContentBytesFromHeaders(headers({ 'content-length': bad })),
      ).toBeUndefined()
    }
  })

  it('trims surrounding whitespace on an otherwise-valid value', () => {
    expect(
      requestContentBytesFromHeaders(headers({ 'content-length': '  42  ' })),
    ).toBe(42)
  })

  it('drops an implausibly large body (>1 GiB)', () => {
    expect(
      requestContentBytesFromHeaders(
        headers({ 'content-length': '9999999999999999999999' }),
      ),
    ).toBeUndefined()
  })
})
