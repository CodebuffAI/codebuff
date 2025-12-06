import path from 'path'
import fs from 'fs'
import os from 'os'

import { launchTerminal } from 'tuistory'

import { isSDKBuilt, getDefaultCliEnv } from '../test-utils'

import type { E2EServer } from './test-server-utils'
import type { E2ETestUser } from './test-db-utils'

const CLI_PATH = path.join(__dirname, '../../index.tsx')

/** Type for the terminal session returned by tuistory */
type TerminalSessionType = Awaited<ReturnType<typeof launchTerminal>>

export interface E2ESession {
  cli: TerminalSessionType
  credentialsDir: string
}

/**
 * Get the credentials directory path for e2e tests
 * Uses a unique directory per session to avoid conflicts
 */
export function getE2ECredentialsDir(sessionId: string): string {
  return path.join(os.tmpdir(), `codebuff-e2e-${sessionId}`)
}

/**
 * Create credentials file for a test user
 */
export function createTestCredentials(credentialsDir: string, user: E2ETestUser): string {
  // Ensure directory exists
  if (!fs.existsSync(credentialsDir)) {
    fs.mkdirSync(credentialsDir, { recursive: true })
  }

  // Write credentials to the same location the CLI reads from:
  // $HOME/.config/manicode-<env>/credentials.json
  const configDir = path.join(
    credentialsDir,
    '.config',
    `manicode-${process.env.NEXT_PUBLIC_CB_ENVIRONMENT || 'test'}`,
  )
  fs.mkdirSync(configDir, { recursive: true })

  const credentialsPath = path.join(configDir, 'credentials.json')
  const credentials = {
    default: {
      id: user.id,
      name: user.name,
      email: user.email,
      authToken: user.authToken,
    },
  }

  fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2))

  // Also drop a convenience copy at the root for debugging
  const legacyPath = path.join(credentialsDir, 'credentials.json')
  fs.writeFileSync(legacyPath, JSON.stringify(credentials, null, 2))
  return credentialsPath
}

/**
 * Clean up credentials directory
 */
export function cleanupCredentials(credentialsDir: string): void {
  try {
    if (fs.existsSync(credentialsDir)) {
      fs.rmSync(credentialsDir, { recursive: true, force: true })
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Launch the CLI with authentication for e2e tests
 */
export async function launchAuthenticatedCLI(options: {
  server: E2EServer
  user: E2ETestUser
  sessionId: string
  args?: string[]
  cols?: number
  rows?: number
}): Promise<E2ESession> {
  const { server, user, sessionId, args = [], cols = 120, rows = 30 } = options

  // Check SDK is built
  if (!isSDKBuilt()) {
    throw new Error('SDK must be built before running e2e tests. Run: cd sdk && bun run build')
  }

  // Create credentials directory and file
  const credentialsDir = getE2ECredentialsDir(sessionId)
  createTestCredentials(credentialsDir, user)

  // Get base CLI environment
  const baseEnv = getDefaultCliEnv()

  // Build e2e-specific environment
  const e2eEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...baseEnv,
    // Point to e2e server
    NEXT_PUBLIC_CODEBUFF_BACKEND_URL: server.backendUrl,
    NEXT_PUBLIC_CODEBUFF_APP_URL: server.url,
    // Use test environment
    NEXT_PUBLIC_CB_ENVIRONMENT: 'test',
    // Override config directory to use our test credentials (isolated per session)
    HOME: credentialsDir,
    XDG_CONFIG_HOME: path.join(credentialsDir, '.config'),
    // Provide auth token via environment (fallback)
    CODEBUFF_API_KEY: user.authToken,
    CODEBUFF_DISABLE_FILE_LOGS: 'true',
    // Disable analytics
    NEXT_PUBLIC_POSTHOG_API_KEY: '',
  }

  // Launch the CLI
  const cli = await launchTerminal({
    command: 'bun',
    args: ['run', CLI_PATH, ...args],
    cols,
    rows,
    env: e2eEnv,
    cwd: process.cwd(),
  })
  const originalPress = cli.press.bind(cli)
  cli.type = async (text: string) => {
    for (const char of text) {
      // Send each keypress with a small delay to avoid dropped keystrokes in the TUI
      if (char === ' ') {
        await originalPress('space')
      } else {
        await originalPress(char as any)
      }
      // Slightly longer delay improves reliability under load (tuistory can miss very fast keystrokes)
      await sleep(35)
    }
  }

  return {
    cli,
    credentialsDir,
  }
}

/**
 * Close an e2e CLI session and clean up
 */
export async function closeE2ESession(session: E2ESession): Promise<void> {
  try {
    // Send Ctrl+C twice to ensure exit
    await session.cli.press(['ctrl', 'c'])
    await sleep(300)
    await session.cli.press(['ctrl', 'c'])
    await sleep(500)
  } catch {
    // Ignore errors during shutdown
  } finally {
    session.cli.close()
    cleanupCredentials(session.credentialsDir)
  }
}

/**
 * Helper to create an e2e test context for a describe block
 */
export interface E2ETestContext {
  db: import('./test-db-utils').E2EDatabase
  server: E2EServer
  createSession: (user?: E2ETestUser, args?: string[]) => Promise<E2ESession>
  cleanup: () => Promise<void>
}

/**
 * Create a full e2e test context with database, server, and CLI utilities
 */
export async function createE2ETestContext(describeId: string): Promise<E2ETestContext> {
  const { createE2EDatabase, destroyE2EDatabase, E2E_TEST_USERS } = await import('./test-db-utils')
  const { startE2EServer, stopE2EServer } = await import('./test-server-utils')

  // Start database
  const db = await createE2EDatabase(describeId)

  // Start server
  const server = await startE2EServer(db.databaseUrl)

  // Track sessions for cleanup
  const sessions: E2ESession[] = []
  let sessionCounter = 0

  const createSession = async (user: E2ETestUser = E2E_TEST_USERS.default, args: string[] = []): Promise<E2ESession> => {
    const sessionId = `${describeId}-${++sessionCounter}-${Date.now()}`
    const session = await launchAuthenticatedCLI({
      server,
      user,
      sessionId,
      args,
    })
    sessions.push(session)
    return session
  }

  const cleanup = async (): Promise<void> => {
    // Close all CLI sessions
    for (const session of sessions) {
      await closeE2ESession(session)
    }

    // Stop server
    await stopE2EServer(server)

    // Destroy database
    await destroyE2EDatabase(db)
  }

  return {
    db,
    server,
    createSession,
    cleanup,
  }
}

/**
 * Helper function for async sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Export sleep for use in tests
 */
export { sleep }
