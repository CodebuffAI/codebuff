import { describe, expect, test } from 'bun:test'

import { getGravityIndexParts } from '../gravity-index'

describe('getGravityIndexParts', () => {
  test('describes search queries', () => {
    expect(
      getGravityIndexParts({
        action: 'search',
        query: 'transactional email for a Next.js app',
      }),
    ).toEqual({
      name: 'Services · Search',
      description: 'transactional email for a Next.js app',
    })
  })

  test('describes browse category and keyword', () => {
    expect(
      getGravityIndexParts({
        action: 'browse',
        category: 'Email',
        q: 'send',
      }),
    ).toEqual({
      name: 'Services · Browse',
      description: 'Email · send',
    })
  })

  test('describes service detail lookups', () => {
    expect(
      getGravityIndexParts({
        action: 'get_service',
        slug: 'sendgrid',
      }),
    ).toEqual({
      name: 'Services · Fetch',
      description: 'sendgrid',
    })
  })

  test('describes completed integration reports', () => {
    expect(
      getGravityIndexParts({
        action: 'report_integration',
        integrated_slug: 'sendgrid',
      }),
    ).toEqual({
      name: 'Services · Report',
      description: 'sendgrid integration',
    })
  })

  test('names the action even when the target is missing', () => {
    expect(getGravityIndexParts({ action: 'search' })).toEqual({
      name: 'Services · Search',
      description: '',
    })
    expect(getGravityIndexParts({ action: 'list_categories' })).toEqual({
      name: 'Services · Categories',
      description: '',
    })
  })

  test('falls back to the brand for unknown input', () => {
    expect(getGravityIndexParts({ action: 'unknown' })).toEqual({
      name: 'Services',
      description: '',
    })
    expect(getGravityIndexParts(null)).toEqual({
      name: 'Services',
      description: '',
    })
  })
})
