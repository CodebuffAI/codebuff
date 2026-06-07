import { describe, expect, it } from 'bun:test'

import { isFreebuffWebServiceUser } from '../freebuff-web-service-account'

describe('isFreebuffWebServiceUser', () => {
  const serviceUserId = '11111111-1111-4111-8111-111111111111'

  it('only matches the configured service user', () => {
    expect(isFreebuffWebServiceUser(serviceUserId, serviceUserId)).toBe(true)
    expect(
      isFreebuffWebServiceUser(
        '22222222-2222-4222-8222-222222222222',
        serviceUserId,
      ),
    ).toBe(false)
  })

  it('does not grant access when the service user is not configured', () => {
    expect(isFreebuffWebServiceUser(serviceUserId, undefined)).toBe(false)
  })
})
