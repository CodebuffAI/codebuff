import { defineConfig, devices } from '@playwright/test'

// Use the same port as the dev server, defaulting to 3000
const PORT = process.env.NEXT_PUBLIC_WEB_PORT || '3000'
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './src/__tests__/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
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
    command: `NEXT_PUBLIC_WEB_PORT=${PORT} bun run dev`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
})
