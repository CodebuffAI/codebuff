import { test, expect } from '@playwright/test'

// Disable JS to validate pure SSR HTML
test.use({ javaScriptEnabled: false })

test('SSR HTML contains at least one agent card', async ({ page }) => {
  const agents = [
    {
      id: 'base',
      name: 'Base',
      description: 'desc',
      publisher: { id: 'codebuff', name: 'Codebuff', verified: true, avatar_url: null },
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

  // Mock the server-side API call that happens during SSR
  // This intercepts the request before SSR completes
  await page.route('**/api/agents', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(agents),
    })
  })

  const response = await page.goto('/store', {
    waitUntil: 'domcontentloaded',
  })
  expect(response).not.toBeNull()
  const html = await response!.text()

  // Validate SSR output contains agent content (publisher + id)
  expect(html).toContain('@codebuff')
  expect(html).toContain('>base<')
})
