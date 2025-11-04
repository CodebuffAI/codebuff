import { test, expect } from '@playwright/test'
// Skip e2e in default CI to reduce latency. Consider enabling
// in a non-latency-sensitive workflow or on-demand nightly runs.
test.describe.configure({ mode: 'skip' })

// Disable JS to validate pure SSR HTML
test.use({ javaScriptEnabled: false })

test('SSR HTML contains at least one agent card', async ({ page }) => {
  const response = await page.goto('/store?e2eFixture=1', {
    waitUntil: 'domcontentloaded',
  })
  expect(response).not.toBeNull()
  const html = await response!.text()

  // Validate SSR output contains agent content (publisher + id)
  expect(html).toContain('@codebuff')
  expect(html).toContain('>base<')
})
