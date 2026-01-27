import { getE2EDatabaseUrl } from '@codebuff/internal/db/e2e-constants'
import { defineConfig, devices } from '@playwright/test'

// Use the same port as the dev server, defaulting to 3000
const PORT = process.env.NEXT_PUBLIC_WEB_PORT || '3000'
const BASE_URL = `http://127.0.0.1:${PORT}`
const E2E_DATABASE_URL = getE2EDatabaseUrl()

export default defineConfig({
  testDir: './src/__tests__/e2e',
  outputDir: '../debug/playwright-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: '../debug/playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  webServer: {
    command: 'bun run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_WEB_PORT: PORT,
      BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA: 'true',
      DATABASE_URL: E2E_DATABASE_URL,
    },
  },
})
