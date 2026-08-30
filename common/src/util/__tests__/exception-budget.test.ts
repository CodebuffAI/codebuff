import { describe, expect, it } from 'bun:test'

import { createExceptionBeforeSend } from '../exception-budget'

const exception = (value: string, extra?: Record<string, any>) => ({
  event: '$exception',
  properties: {
    $exception_list: [{ type: 'Error', value, ...extra }],
  } as Record<string, any>,
})

describe('createExceptionBeforeSend', () => {
  it('passes ordinary analytics events through untouched and unbudgeted', () => {
    const beforeSend = createExceptionBeforeSend()
    const event = { event: 'message_sent', properties: { a: 1 } }
    for (let i = 0; i < 1000; i++) expect(beforeSend(event)).toBe(event)
  })

  it('tolerates a null event', () => {
    expect(createExceptionBeforeSend()(null)).toBeNull()
  })

  it('collapses a million repeats into a ladder of seven, carrying the true count', () => {
    const beforeSend = createExceptionBeforeSend()
    const sent: number[] = []
    for (let i = 0; i < 1_000_000; i++) {
      const kept = beforeSend(exception('loop'))
      if (kept) sent.push(kept.properties.$exception_occurrence)
    }
    expect(sent).toEqual([1, 10, 100, 1_000, 10_000, 100_000, 1_000_000])
  })

  it('always sends the first sighting of a distinct error', () => {
    const beforeSend = createExceptionBeforeSend()
    for (let i = 0; i < 50; i++) beforeSend(exception('noisy'))
    expect(beforeSend(exception('brand new'))).not.toBeNull()
  })

  it('groups by message, not by stack, so one bug is one bucket', () => {
    const beforeSend = createExceptionBeforeSend()
    const thrownAtLine = (lineno: number) =>
      exception('boom', { stacktrace: { frames: [{ lineno }] } })
    expect(beforeSend(thrownAtLine(1))).not.toBeNull()
    expect(beforeSend(thrownAtLine(99))).toBeNull()
  })

  // Unhandled rejections are the loudest source this bounds, and both libraries
  // stringify a non-Error reason before before_send sees it, so those bucket by
  // reason rather than collapsing into one.
  it('keeps distinct non-Error rejection reasons in distinct buckets', () => {
    const beforeSend = createExceptionBeforeSend()
    const objectReason = 'Object captured as exception with keys: code'
    expect(beforeSend(exception(objectReason))).not.toBeNull()
    expect(beforeSend(exception('a plain string reason'))).not.toBeNull()
    expect(beforeSend(exception(objectReason))).toBeNull()
  })

  it('stops opening buckets once a process has seen too many distinct errors', () => {
    const beforeSend = createExceptionBeforeSend()
    for (let i = 0; i < 200; i++) {
      expect(beforeSend(exception(`distinct ${i}`))).not.toBeNull()
    }
    expect(beforeSend(exception('one too many'))).toBeNull()
    // A fingerprint refused by the cap must not be remembered either, or churn
    // would grow the map without bound — which is what the cap guards.
    expect(beforeSend(exception('one too many'))).toBeNull()
  })
})
