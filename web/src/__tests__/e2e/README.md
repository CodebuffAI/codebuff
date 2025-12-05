# Web E2E Testing

> **See also:** [Root TESTING.md](../../../../TESTING.md) for an overview of testing across the entire monorepo.

## What "E2E" Means for Web

Web E2E tests use **Playwright** to test the browser experience:

```
Real Browser → Page Load → SSR/Hydration → User Interactions → API Calls
```

These tests verify that:

- Pages render correctly (SSR and client-side)
- User interactions work as expected
- API integration functions properly

## Running Tests

```bash
cd web

# Run all Playwright tests
bunx playwright test

# Run with UI mode (interactive debugging)
bunx playwright test --ui

# Run specific test file
bunx playwright test store-ssr.spec.ts

# Run in headed mode (see the browser)
bunx playwright test --headed

# Debug mode (step through)
bunx playwright test --debug
```

## Prerequisites

1. **Install Playwright browsers:**

   ```bash
   bunx playwright install
   ```

2. **Web server** - Playwright auto-starts the dev server, but you can also run it manually:
   ```bash
   bun run dev
   ```

## Configuration

Playwright config is at `web/playwright.config.ts`:

- **Test directory:** `./src/__tests__/e2e`
- **Browsers:** Chromium, Firefox, WebKit
- **Base URL:** `http://127.0.0.1:3000` (configurable via `NEXT_PUBLIC_WEB_PORT`)
- **Web server:** Auto-started with `bun run dev`

## Test Structure

### SSR Tests

Test server-side rendering with JavaScript disabled:

```typescript
import { test, expect } from '@playwright/test'

test.use({ javaScriptEnabled: false })

test('SSR renders content', async ({ page }) => {
  await page.goto('/store')
  const html = await page.content()
  expect(html).toContain('expected-content')
})
```

### Hydration Tests

Test client-side hydration and interactivity:

```typescript
import { test, expect } from '@playwright/test'

test('page hydrates correctly', async ({ page }) => {
  await page.goto('/store')
  await expect(page.getByRole('button')).toBeVisible()
})
```

### API Mocking

Mock API responses for isolated testing:

```typescript
test('handles API response', async ({ page }) => {
  await page.route('**/api/agents', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 'test-agent' }]),
    })
  })

  await page.goto('/store')
  // Assert mocked data is displayed
})
```

## File Naming

- Use `*.spec.ts` for Playwright tests (convention from Playwright)
- This distinguishes them from Bun tests (`*.test.ts`)

## Current Tests

| File                      | Description                                              |
| ------------------------- | -------------------------------------------------------- |
| `store-ssr.spec.ts`       | Verifies SSR renders agent cards without JavaScript      |
| `store-hydration.spec.ts` | Verifies client-side hydration displays agents correctly |

## Debugging

### View test report

```bash
bunx playwright show-report
```

### Trace viewer

When tests fail in CI, traces are captured. View them with:

```bash
bunx playwright show-trace trace.zip
```

### Screenshots

Playwright automatically captures screenshots on failure. Find them in `test-results/`.

## CI/CD

In CI:

- Tests run in headless mode
- Retries are enabled (2 retries)
- Workers are limited to 1 for stability
- Traces are captured on first retry

## Adding New Tests

1. Create a new `*.spec.ts` file in this directory
2. Import from `@playwright/test`
3. Use `page.goto()` to navigate
4. Use `expect()` for assertions
5. Mock APIs as needed with `page.route()`

```typescript
import { test, expect } from '@playwright/test'

test('my new feature works', async ({ page }) => {
  await page.goto('/my-page')
  await page.click('button')
  await expect(page.locator('.result')).toBeVisible()
})
```
