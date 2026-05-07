import { describe, expect, test } from 'bun:test'

import { getGravityIndexDescription } from '../gravity-index'

describe('getGravityIndexDescription', () => {
  test('describes search queries', () => {
    expect(
      getGravityIndexDescription({
        action: 'search',
        query: 'transactional email for a Next.js app',
      }),
    ).toBe('Searching transactional email for a Next.js app')
  })

  test('describes browse category and keyword', () => {
    expect(
      getGravityIndexDescription({
        action: 'browse',
        category: 'Email',
        q: 'send',
      }),
    ).toBe('Browsing Email for send')
  })

  test('describes service detail lookups', () => {
    expect(
      getGravityIndexDescription({
        action: 'get_service',
        slug: 'sendgrid',
      }),
    ).toBe('Getting sendgrid')
  })

  test('describes completed integration reports', () => {
    expect(
      getGravityIndexDescription({
        action: 'report_integration',
        integrated_slug: 'sendgrid',
      }),
    ).toBe('Reporting sendgrid integration')
  })

  test('uses fallback text for unknown input', () => {
    expect(getGravityIndexDescription({ action: 'unknown' })).toBe(
      'Using service catalog',
    )
    expect(getGravityIndexDescription(null)).toBe('Using service catalog')
  })
})
