import { describe, expect, test } from 'bun:test'

import {
  freebuffChargeChargedText,
  freebuffChargeReturnText,
  freebuffChargeSourceText,
} from '../freebuff-session-charge'

const NOW = new Date('2026-10-16T18:00:00.000Z')

describe('freebuffChargeChargedText', () => {
  test('a price is whole hours', () => {
    expect(freebuffChargeChargedText({ charged: 15 })).toBe('3 hrs')
    expect(freebuffChargeChargedText({ charged: 5 })).toBe('1 hr')
  })
})

describe('freebuffChargeReturnText', () => {
  test('nothing back once the hour is over', () => {
    expect(freebuffChargeReturnText({ returned: 0 }, NOW)).toBe('None back')
  })

  test('null while the hour can still return something', () => {
    expect(
      freebuffChargeReturnText(
        { returned: 0, settlesAt: '2026-10-16T18:30:00.000Z' },
        NOW,
      ),
    ).toBeNull()
  })

  test('a settles time already past reads as settled', () => {
    expect(
      freebuffChargeReturnText(
        { returned: 0, settlesAt: '2026-10-16T17:30:00.000Z' },
        NOW,
      ),
    ).toBe('None back')
  })

  test('whole hours back', () => {
    expect(freebuffChargeReturnText({ returned: 10 }, NOW)).toBe('2 hrs back')
    expect(freebuffChargeReturnText({ returned: 5 }, NOW)).toBe('1 hr back')
  })

  test('a return smaller than an hour never reads as zero', () => {
    // Legacy rows (before whole-hour refunds) and partial wallet shares.
    expect(freebuffChargeReturnText({ returned: 4 }, NOW)).toBe(
      'Under 1 hr back',
    )
    expect(freebuffChargeReturnText({ returned: 1 }, NOW)).toBe(
      'Under 1 hr back',
    )
  })

  test('a non-whole return keeps its whole hours and drops the rest', () => {
    expect(freebuffChargeReturnText({ returned: 14 }, NOW)).toBe('2 hrs back')
  })
})

describe('freebuffChargeSourceText', () => {
  test('silent when the day paid for it', () => {
    expect(
      freebuffChargeSourceText({ charged: 15, chargedFromWallet: 0 }),
    ).toBeNull()
  })

  test('names the wallet when the wallet paid', () => {
    expect(
      freebuffChargeSourceText({ charged: 15, chargedFromWallet: 15 }),
    ).toBe('From your wallet')
    expect(
      freebuffChargeSourceText({ charged: 15, chargedFromWallet: 5 }),
    ).toBe('Part from your wallet')
  })
})
