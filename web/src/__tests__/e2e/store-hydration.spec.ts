import { test, expect } from '@playwright/test'

test('store hydrates agents via client fetch when SSR is empty', async ({ page }) => {
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

  // Intercept client-side fetch to /api/agents to return our fixture
  await page.route('**/api/agents', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(agents),
    })
  })

  await page.goto('/store')

  // Expect the agent card to render after hydration by checking the copy button title
  await expect(
    page.getByTitle('Copy: codebuff --agent codebuff/base@1.2.3').first(),
  ).toBeVisible()
})
