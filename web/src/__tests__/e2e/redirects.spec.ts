/**
 * E2E Tests for Redirect Routes
 *
 * These tests verify that redirects work correctly and preserve query parameters.
 */

export {}

const isBun = typeof Bun !== 'undefined'

if (isBun) {
  const { describe, it } = await import('bun:test')

  describe.skip('playwright-only', () => {
    it('skipped under bun test runner', () => {})
  })
} else {
  const { test, expect } = await import('@playwright/test')

  test.describe('Redirect Routes', { tag: '@redirects' }, () => {
    test.describe('/b/:hash redirect to go.trybeluga.ai', () => {
      test('redirects to go.trybeluga.ai with the hash', async ({ request }) => {
        const response = await request.get('/b/test123', {
          maxRedirects: 0,
        })

        expect(response.status()).toBe(307)
        expect(response.headers()['location']).toBe(
          'https://go.trybeluga.ai/test123',
        )
      })

      test('preserves query parameters in redirect', async ({ request }) => {
        const response = await request.get('/b/abc-xyz?foo=bar&utm_source=test', {
          maxRedirects: 0,
        })

        expect(response.status()).toBe(307)
        const location = response.headers()['location']
        expect(location).toContain('https://go.trybeluga.ai/abc-xyz')
        expect(location).toContain('foo=bar')
        expect(location).toContain('utm_source=test')
      })

      test('handles special characters in hash', async ({ request }) => {
        const response = await request.get('/b/hash-with-dashes-123', {
          maxRedirects: 0,
        })

        expect(response.status()).toBe(307)
        expect(response.headers()['location']).toBe(
          'https://go.trybeluga.ai/hash-with-dashes-123',
        )
      })

      test('preserves multiple query parameters', async ({ request }) => {
        const response = await request.get(
          '/b/multiq?a=1&b=2&c=3&utm_campaign=test',
          {
            maxRedirects: 0,
          },
        )

        expect(response.status()).toBe(307)
        const location = response.headers()['location']
        expect(location).toContain('https://go.trybeluga.ai/multiq')
        expect(location).toContain('a=1')
        expect(location).toContain('b=2')
        expect(location).toContain('c=3')
        expect(location).toContain('utm_campaign=test')
      })
    })

  })
}
