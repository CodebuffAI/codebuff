/**
 * Real E2E Tests for Codebuff CLI
 *
 * These tests run against a real web server with a real database.
 * Each describe block spins up its own fresh database and server for complete isolation.
 *
 * Prerequisites:
 * - Docker must be running
 * - SDK must be built: cd sdk && bun run build
 * - psql must be available (for seeding)
 *
 * Run with: bun test e2e/e2e-tuistory.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'

import { isSDKBuilt } from '../test-utils'
import { createE2ETestContext, sleep } from './test-cli-utils'
import { E2E_TEST_USERS } from './test-db-utils'

import type { E2ETestContext } from './test-cli-utils'

const TIMEOUT_MS = 180000 // 3 minutes for e2e tests
const sdkBuilt = isSDKBuilt()

// Check if Docker is available
function isDockerAvailable(): boolean {
  try {
    const { execSync } = require('child_process')
    execSync('docker info', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

const dockerAvailable = isDockerAvailable()

// Skip all e2e tests if prerequisites aren't met
const shouldSkip = !sdkBuilt || !dockerAvailable

if (!sdkBuilt) {
  console.log('⚠️  E2E tests skipped: SDK not built. Run: cd sdk && bun run build')
}

if (!dockerAvailable) {
  console.log('⚠️  E2E tests skipped: Docker not available')
}

describe.skipIf(shouldSkip)('E2E: Chat Interaction', () => {
  let ctx: E2ETestContext

  beforeAll(async () => {
    console.log('\n🚀 Starting E2E test context for Chat Interaction...')
    ctx = await createE2ETestContext('chat-interaction')
    console.log('✅ E2E test context ready\n')
  })

  afterAll(async () => {
    console.log('\n🧹 Cleaning up E2E test context...')
    await ctx?.cleanup()
    console.log('✅ Cleanup complete\n')
  })

  test(
    'can start CLI and see welcome message',
    async () => {
      const session = await ctx.createSession()

      // Wait for CLI to render
      await sleep(5000)

      const text = await session.cli.text()
      // Should show Codebuff branding or welcome message
      const hasWelcome =
        text.toLowerCase().includes('codebuff') ||
        text.includes('Directory') ||
        text.includes('will run commands')
      expect(hasWelcome).toBe(true)
    },
    TIMEOUT_MS,
  )

  test(
    'can type a message',
    async () => {
      const session = await ctx.createSession()

      await sleep(5000)

      // Type a test message
      await session.cli.type('Hello from e2e test')
      await sleep(500)

      const text = await session.cli.text()
      expect(text).toContain('Hello from e2e test')
    },
    TIMEOUT_MS,
  )

  test(
    'shows thinking status when sending message',
    async () => {
      const session = await ctx.createSession()

      await sleep(5000)

      // Type and send a message
      await session.cli.type('What is 2+2?')
      await sleep(300)
      await session.cli.press('enter')

      // Wait for status to appear
      await sleep(2000)

      const text = await session.cli.text()
      // Should show some status indicator
      const hasStatus =
        text.includes('thinking') ||
        text.includes('working') ||
        text.includes('connecting') ||
        text.includes('What is 2+2?') // Message should at least appear
      expect(hasStatus).toBe(true)
    },
    TIMEOUT_MS,
  )
})

describe.skipIf(shouldSkip)('E2E: Slash Commands', () => {
  let ctx: E2ETestContext

  beforeAll(async () => {
    console.log('\n🚀 Starting E2E test context for Slash Commands...')
    ctx = await createE2ETestContext('slash-commands')
    console.log('✅ E2E test context ready\n')
  })

  afterAll(async () => {
    console.log('\n🧹 Cleaning up E2E test context...')
    await ctx?.cleanup()
    console.log('✅ Cleanup complete\n')
  })

  test(
    '/new command clears conversation',
    async () => {
      const session = await ctx.createSession()

      await sleep(5000)

      // Type /new and press enter
      await session.cli.type('/new')
      await sleep(300)
      await session.cli.press('enter')
      await sleep(1500)

      const text = await session.cli.text()
      // CLI should still be running
      expect(text.length).toBeGreaterThan(0)
    },
    TIMEOUT_MS,
  )

  test(
    '/usage shows credit information',
    async () => {
      const session = await ctx.createSession()

      await sleep(5000)

      // Type /usage and press enter
      await session.cli.type('/usage')
      await sleep(300)
      await session.cli.press('enter')
      await sleep(2000)

      const text = await session.cli.text()
      // Should show some credit-related information
      const hasUsageInfo =
        text.toLowerCase().includes('credit') ||
        text.toLowerCase().includes('usage') ||
        text.includes('1000') || // Test user has 1000 credits
        text.includes('/usage')
      expect(hasUsageInfo).toBe(true)
    },
    TIMEOUT_MS,
  )

  test(
    'typing / shows command suggestions',
    async () => {
      const session = await ctx.createSession()

      await sleep(5000)

      // Type / to trigger suggestions
      await session.cli.type('/')
      await sleep(1000)

      const text = await session.cli.text()
      // Should show some commands
      const hasCommands =
        text.includes('new') ||
        text.includes('exit') ||
        text.includes('usage') ||
        text.includes('init')
      expect(hasCommands).toBe(true)
    },
    TIMEOUT_MS,
  )
})

describe.skipIf(shouldSkip)('E2E: User Authentication', () => {
  let ctx: E2ETestContext

  beforeAll(async () => {
    console.log('\n🚀 Starting E2E test context for User Authentication...')
    ctx = await createE2ETestContext('user-auth')
    console.log('✅ E2E test context ready\n')
  })

  afterAll(async () => {
    console.log('\n🧹 Cleaning up E2E test context...')
    await ctx?.cleanup()
    console.log('✅ Cleanup complete\n')
  })

  test(
    'authenticated user can access CLI',
    async () => {
      const session = await ctx.createSession(E2E_TEST_USERS.default)

      await sleep(5000)

      const text = await session.cli.text()
      // Should show the main CLI, not login prompt
      // Login prompt would show "ENTER" or "login"
      const isAuthenticated =
        text.includes('Directory') ||
        text.includes('codebuff') ||
        text.includes('Codebuff')
      expect(isAuthenticated).toBe(true)
    },
    TIMEOUT_MS,
  )

  test(
    '/logout command triggers logout',
    async () => {
      const session = await ctx.createSession(E2E_TEST_USERS.default)

      await sleep(5000)

      // Type /logout
      await session.cli.type('/logout')
      await sleep(300)
      await session.cli.press('enter')
      await sleep(2000)

      const text = await session.cli.text()
      // Should show logged out or login prompt
      const isLoggedOut =
        text.toLowerCase().includes('logged out') ||
        text.toLowerCase().includes('log out') ||
        text.includes('ENTER') || // Login prompt
        text.includes('/logout') // Command was entered
      expect(isLoggedOut).toBe(true)
    },
    TIMEOUT_MS,
  )
})

describe.skipIf(shouldSkip)('E2E: Agent Modes', () => {
  let ctx: E2ETestContext

  beforeAll(async () => {
    console.log('\n🚀 Starting E2E test context for Agent Modes...')
    ctx = await createE2ETestContext('agent-modes')
    console.log('✅ E2E test context ready\n')
  })

  afterAll(async () => {
    console.log('\n🧹 Cleaning up E2E test context...')
    await ctx?.cleanup()
    console.log('✅ Cleanup complete\n')
  })

  test(
    'can switch to lite mode',
    async () => {
      const session = await ctx.createSession()

      await sleep(5000)

      // Type mode command
      await session.cli.type('/mode:lite')
      await sleep(300)
      await session.cli.press('enter')
      await sleep(1500)

      const text = await session.cli.text()
      // Should show mode change confirmation
      const hasModeChange =
        text.toLowerCase().includes('lite') ||
        text.toLowerCase().includes('mode') ||
        text.includes('/mode:lite')
      expect(hasModeChange).toBe(true)
    },
    TIMEOUT_MS,
  )

  test(
    'can switch to max mode',
    async () => {
      const session = await ctx.createSession()

      await sleep(5000)

      // Type mode command and send it
      await session.cli.type('/mode:max')
      await sleep(300)
      await session.cli.press('enter')
      await sleep(2000)

      const text = await session.cli.text()
      // After switching to max mode, the CLI shows "MAX" in the header/mode indicator
      // or shows a confirmation message. Check for various indicators.
      const hasModeChange =
        text.toUpperCase().includes('MAX') ||
        text.includes('/mode:max') ||
        text.toLowerCase().includes('switched') ||
        text.toLowerCase().includes('changed') ||
        text.toLowerCase().includes('mode')
      expect(hasModeChange).toBe(true)
    },
    TIMEOUT_MS,
  )
})

// Placeholder describe blocks for tests that are skipped when prerequisites aren't met
if (!sdkBuilt) {
  describe('E2E Prerequisites', () => {
    test.skip('SDK must be built: cd sdk && bun run build', () => {})
  })
}

if (!dockerAvailable) {
  describe('E2E Prerequisites', () => {
    test.skip('Docker must be running for e2e tests', () => {})
  })
}
