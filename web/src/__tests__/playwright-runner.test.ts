export {}

import { describe, expect, it, setDefaultTimeout } from 'bun:test'

setDefaultTimeout(10 * 60 * 1000)

describe('playwright e2e suite', () => {
  it('passes', async () => {
    const env = { ...process.env }
    delete env.CI
    delete env.GITHUB_ACTIONS
    env.NEXT_PUBLIC_CB_ENVIRONMENT ||= 'test'
    env.NEXT_PUBLIC_CODEBUFF_APP_URL ||= 'http://localhost:3000'
    env.NEXT_PUBLIC_SUPPORT_EMAIL ||= 'support@codebuff.com'
    env.NEXT_PUBLIC_POSTHOG_API_KEY ||= 'test-posthog-key'
    env.NEXT_PUBLIC_POSTHOG_HOST_URL ||= 'https://us.i.posthog.com'
    env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||= 'pk_test_placeholder'
    env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL ||=
      'https://billing.stripe.com/p/login/test_placeholder'
    env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID ||= 'test-verification'
    env.NEXT_PUBLIC_WEB_PORT ||= '3000'
    env.OPEN_ROUTER_API_KEY ||= 'test'
    env.OPENAI_API_KEY ||= 'test'
    env.LINKUP_API_KEY ||= 'test'
    env.PORT = env.NEXT_PUBLIC_WEB_PORT
    env.DATABASE_URL ||= 'postgres://user:pass@localhost:5432/db'
    env.CODEBUFF_GITHUB_ID ||= 'test-id'
    env.CODEBUFF_GITHUB_SECRET ||= 'test-secret'
    env.NEXTAUTH_URL ||= 'http://localhost:3000'
    env.NEXTAUTH_SECRET ||= 'test-secret'
    env.STRIPE_SECRET_KEY ||= 'sk_test_dummy'
    env.STRIPE_WEBHOOK_SECRET_KEY ||= 'whsec_dummy'
    env.STRIPE_USAGE_PRICE_ID ||= 'price_test'
    env.STRIPE_TEAM_FEE_PRICE_ID ||= 'price_test'
    env.LOOPS_API_KEY ||= 'test'
    env.DISCORD_PUBLIC_KEY ||= 'test'
    env.DISCORD_BOT_TOKEN ||= 'test'
    env.DISCORD_APPLICATION_ID ||= 'test'

    const proc = Bun.spawn(
      ['bunx', 'playwright', 'test', '-c', 'playwright.config.ts'],
      {
        stdout: 'inherit',
        stderr: 'inherit',
        env,
        cwd: import.meta.dir.replace('/src/__tests__', ''),
      },
    )

    const exitCode = await proc.exited
    expect(exitCode).toBe(0)
  })
})
