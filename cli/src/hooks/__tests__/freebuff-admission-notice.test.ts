import { describe, expect, test } from 'bun:test'

import { freebuffAdmissionNotice } from '../use-freebuff-chat-admission'

import type { FreebuffSessionResponse } from '../../types/freebuff-session'

describe('freebuffAdmissionNotice', () => {
  test('a suspended account is pointed at the appeal page', () => {
    const notice = freebuffAdmissionNotice({
      status: 'banned',
    } as FreebuffSessionResponse)
    expect(notice).toContain('https://freebuff.com/account?tab=standing')
    expect(notice).toContain('support@freebuff.com')
  })

  test('a Freebucks shortfall is told in hours', () => {
    const notice = freebuffAdmissionNotice({
      status: 'rate_limited',
      freebucksShortfall: { price: 15, balance: 7 },
    } as FreebuffSessionResponse)
    expect(notice).toStartWith('Not enough hours: 1.4 hours available.')
    expect(notice).not.toContain('Freebucks')
  })
})
