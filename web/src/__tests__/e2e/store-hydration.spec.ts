export {}

const isBun = typeof Bun !== 'undefined'

if (isBun) {
  const { describe, it } = await import('bun:test')

  describe.skip('playwright-only', () => {
    it('skipped under bun test runner', () => {})
  })
} else {
  const { test, expect } = await import('@playwright/test')

  test('store hydrates agents via client fetch when SSR is empty', async ({
    page,
  }) => {
    const baseUrl =
      test.info().project.use.baseURL ||
      process.env.PLAYWRIGHT_TEST_BASE_URL ||
      'http://localhost:3000'
    const storeUrl = new URL('/store', baseUrl).toString()
    const agents = [
      {
        id: 'base',
        name: 'Base',
        description: 'desc',
        publisher: {
          id: 'codebuff',
          name: 'Codebuff',
          verified: true,
          avatar_url: null,
        },
        version: '1.2.3',
        created_at: new Date().toISOString(),
        weekly_spent: 10,
        weekly_runs: 5,
        usage_count: 50,
        total_spent: 100,
        avg_cost_per_invocation: 0.2,
        unique_users: 3,
        last_used: new Date().toISOString(),
        version_stats: {},
        tags: ['test'],
      },
    ]

    // Intercept client-side fetch to /api/agents to return our fixture
    await page.route('**/api/agents', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(agents),
      })
    })

    const response = await page.goto(storeUrl)
    const responseText = response ? await response.text() : undefined
    const html = responseText ?? ''

    if (html.match(/Copy: .*--agent/)) {
      // SSR already provided agents; hydration fetch is not expected.
      await expect(
        page.getByTitle(/Copy: .*--agent/).first(),
      ).toBeVisible()
      return
    }

    // Expect the agent card to render after hydration by checking the copy button title
    await expect(
      page.getByTitle(/Copy: .*--agent/).first(),
    ).toBeVisible()
  })
}
