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

    test.describe('Sponsee (affiliate link) redirect', () => {
      test('shows error page for unknown sponsee', async ({ page }) => {
        await page.goto('/unknown-sponsee-name-12345')

        // Should show the error message for unknown sponsee
        await expect(
          page.getByText("that link doesn't look right", { exact: false }),
        ).toBeVisible()
        await expect(
          page.getByText('unknown-sponsee-name-12345', { exact: false }),
        ).toBeVisible()
      })

      test('error page includes support email link', async ({ page }) => {
        await page.goto('/nonexistent-referrer')

        // Should have a link to support email
        const supportLink = page.locator('a[href^="mailto:"]')
        await expect(supportLink).toBeVisible()
      })

      // Note: Testing the happy path (successful redirect with query param preservation)
      // requires a valid sponsee in the database. This test documents the expected behavior
      // and can be run against a seeded test database.
      test.describe('with seeded database', { tag: '@seeded-db' }, () => {
        test.skip(
          () => !process.env.E2E_TEST_SPONSEE,
          'Requires E2E_TEST_SPONSEE env var with a valid sponsee handle',
        )

        test('preserves query parameters when redirecting to referral page', async ({
          request,
        }) => {
          const sponsee = process.env.E2E_TEST_SPONSEE!
          const response = await request.get(
            `/${sponsee}?utm_source=twitter&utm_campaign=test&custom=value`,
            {
              maxRedirects: 0,
            },
          )

          // Should redirect to /referrals/<code>
          expect(response.status()).toBe(307)
          const location = response.headers()['location']
          expect(location).toMatch(/^\/referrals\//)

          // Query params should be preserved
          expect(location).toContain('utm_source=twitter')
          expect(location).toContain('utm_campaign=test')
          expect(location).toContain('custom=value')

          // Referrer param should be added
          expect(location).toContain(`referrer=${sponsee}`)
        })

        test('referrer param overrides existing referrer in query', async ({
          request,
        }) => {
          const sponsee = process.env.E2E_TEST_SPONSEE!
          const response = await request.get(
            `/${sponsee}?referrer=should-be-overridden`,
            {
              maxRedirects: 0,
            },
          )

          expect(response.status()).toBe(307)
          const location = response.headers()['location']

          // The referrer should be the sponsee name, not the original value
          expect(location).toContain(`referrer=${sponsee}`)
          expect(location).not.toContain('should-be-overridden')
        })
      })
    })
  })
}
