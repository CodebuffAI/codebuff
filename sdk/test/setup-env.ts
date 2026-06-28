/**
 * Provide sensible defaults for required client env vars during SDK tests.
 * Keeps tests from failing when a developer hasn't exported local integration env.
 */
const testDefaults: Record<string, string> = {
  NEXT_PUBLIC_CB_ENVIRONMENT: 'test',
  NEXT_PUBLIC_CODEBUFF_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_SUPPORT_EMAIL: 'support@openbuff.dev',
  NEXT_PUBLIC_POSTHOG_API_KEY: 'test-posthog-key',
  NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://us.i.posthog.com',
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID: 'test-verification',
}

const serverDefaults: Record<string, string> = {
  OPEN_ROUTER_API_KEY: 'test',
  OPENAI_API_KEY: 'test',
  LINKUP_API_KEY: 'test',
  PORT: '4242',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  CODEBUFF_GITHUB_ID: 'test-id',
  CODEBUFF_GITHUB_SECRET: 'test-secret',
  NEXTAUTH_SECRET: 'test-secret',
  LOOPS_API_KEY: 'test',
  DISCORD_PUBLIC_KEY: 'test',
  DISCORD_BOT_TOKEN: 'test',
  DISCORD_APPLICATION_ID: 'test',
}

for (const [key, value] of Object.entries(testDefaults)) {
  if (!process.env[key]) {
    process.env[key] = value
  }
}

for (const [key, value] of Object.entries(serverDefaults)) {
  if (!process.env[key]) {
    process.env[key] = value
  }
}

if (process.env.CI !== 'true' && process.env.CI !== '1') {
  process.env.CI = 'true'
}

// Hint to downstream code that this is a test runtime
process.env.NODE_ENV ||= 'test'
process.env.BUN_ENV ||= 'test'
