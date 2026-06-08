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
      name: 'Search services',
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
      name: 'Browse services',
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
      name: 'Fetch service',
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
      name: 'Report integration',
      description: 'sendgrid integration',
    })
  })

  test('names the action even when the target is missing', () => {
    expect(getGravityIndexParts({ action: 'search' })).toEqual({
      name: 'Search services',
      description: '',
    })
    expect(getGravityIndexParts({ action: 'list_categories' })).toEqual({
      name: 'List service categories',
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
