import { spawn, execSync } from 'child_process'
import path from 'path'
import http from 'http'

import type { ChildProcess } from 'child_process'

const WEB_DIR = path.join(__dirname, '../../../../web')

export interface E2EServer {
  process: ChildProcess
  port: number
  url: string
  backendUrl: string
}

/**
 * Find an available port for the web server
 */
export function findAvailableServerPort(basePort: number = 3100): number {
  for (let port = basePort; port < basePort + 100; port++) {
    try {
      execSync(`lsof -i:${port}`, { stdio: 'pipe' })
      // Port is in use, try next
    } catch {
      // Port is available
      return port
    }
  }
  throw new Error(`Could not find available port starting from ${basePort}`)
}

/**
 * Start the web server for e2e tests
 */
export async function startE2EServer(databaseUrl: string): Promise<E2EServer> {
  const port = findAvailableServerPort(3100)
  const url = `http://localhost:${port}`
  const backendUrl = url

  console.log(`[E2E Server] Starting server on port ${port}...`)

  // Build environment variables for the server
  // We inherit the full environment (including Infisical secrets) and override only what's needed
  const serverEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    // Override database to use our test database
    DATABASE_URL: databaseUrl,
    // Override port settings
    PORT: String(port),
    NEXT_PUBLIC_WEB_PORT: String(port),
    // Override URLs to point to this server
    NEXT_PUBLIC_CODEBUFF_APP_URL: url,
    NEXT_PUBLIC_CODEBUFF_BACKEND_URL: backendUrl,
    // Disable analytics in tests
    NEXT_PUBLIC_POSTHOG_API_KEY: '',
  }

  // Spawn the Next.js dev server directly with explicit port
  // We use 'bun next dev -p PORT' instead of 'bun run dev' because:
  // 1. Bun doesn't expand shell variables like ${NEXT_PUBLIC_WEB_PORT:-3000} in npm scripts
  // 2. The .env.worktree file may override PORT/NEXT_PUBLIC_WEB_PORT with worktree-specific values
  // Using the direct command ensures E2E tests always use the intended port
  const serverProcess = spawn('bun', ['next', 'dev', '-p', String(port)], {
    cwd: WEB_DIR,
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })

  // Log server output for debugging
  serverProcess.stdout?.on('data', (data) => {
    const output = data.toString()
    if (output.includes('Ready') || output.includes('Error') || output.includes('error')) {
      console.log(`[E2E Server] ${output.trim()}`)
    }
  })

  serverProcess.stderr?.on('data', (data) => {
    console.error(`[E2E Server Error] ${data.toString().trim()}`)
  })

  serverProcess.on('error', (error) => {
    console.error('[E2E Server] Failed to start:', error)
  })

  // Wait for server to be ready
  await waitForServerReady(url)

  console.log(`[E2E Server] Server ready at ${url}`)

  return {
    process: serverProcess,
    port,
    url,
    backendUrl,
  }
}

/**
 * Wait for the server to be ready to accept requests
 */
async function waitForServerReady(url: string, timeoutMs: number = 120000): Promise<void> {
  const startTime = Date.now()
  
  // Try multiple endpoints - the server might not have /api/health
  const endpointsToTry = [
    `${url}/`,           // Root page (most likely to work)
    `${url}/api/v1/me`,  // Auth endpoint
  ]

  console.log(`[E2E Server] Waiting for server to be ready at ${url} (timeout: ${timeoutMs / 1000}s)...`)

  let lastError: Error | null = null
  let attempts = 0

  while (Date.now() - startTime < timeoutMs) {
    attempts++
    for (const endpoint of endpointsToTry) {
      try {
        const response = await fetchWithTimeout(endpoint, 5000)
        // Any response (even 401/404) means server is up
        if (response.status > 0) {
          console.log(`[E2E Server] Got response from ${endpoint} (status: ${response.status}) after ${attempts} attempts`)
          return
        }
      } catch (error) {
        lastError = error as Error
        // Log every 10 attempts to avoid spam
        if (attempts % 10 === 0) {
          console.log(`[E2E Server] Still waiting... (${attempts} attempts, last error: ${lastError.message})`)
        }
      }
    }
    await sleep(1000)
  }

  throw new Error(`Server did not become ready within ${timeoutMs}ms. Last error: ${lastError?.message || 'unknown'}`)
}

/**
 * Make an HTTP request with timeout
 */
function fetchWithTimeout(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      resolve({ ok: res.statusCode === 200, status: res.statusCode || 0 })
    })

    req.on('error', reject)
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })
  })
}

/**
 * Stop the e2e server
 */
export async function stopE2EServer(server: E2EServer): Promise<void> {
  console.log(`[E2E Server] Stopping server on port ${server.port}...`)

  // Kill any processes on the server port (and common related ports)
  // This ensures child processes spawned by bun are also killed
  const portsToClean = [server.port, 3001] // 3001 is sometimes used by Next.js internally
  for (const port of portsToClean) {
    try {
      const pids = execSync(`lsof -t -i:${port}`, { encoding: 'utf8' }).trim()
      if (pids) {
        // There might be multiple PIDs
        for (const pid of pids.split('\n')) {
          if (pid) {
            try {
              execSync(`kill -9 ${pid}`, { stdio: 'pipe' })
              console.log(`[E2E Server] Killed process ${pid} on port ${port}`)
            } catch {
              // Process may have already exited
            }
          }
        }
      }
    } catch {
      // Port not in use
    }
  }

  return new Promise((resolve) => {
    if (!server.process.pid) {
      resolve()
      return
    }

    // Try to kill the process group (negative PID kills the group)
    try {
      process.kill(-server.process.pid, 'SIGKILL')
    } catch {
      // Process group may not exist, try killing just the process
      try {
        server.process.kill('SIGKILL')
      } catch {
        // Ignore
      }
    }

    // Give it a moment to clean up
    setTimeout(() => {
      console.log(`[E2E Server] Server stopped`)
      resolve()
    }, 1000)
  })
}

/**
 * Kill any orphaned server processes on e2e ports
 */
export function cleanupOrphanedServers(): void {
  console.log('[E2E Server] Cleaning up orphaned servers...')
  
  // Kill any processes on ports 3100-3199
  for (let port = 3100; port < 3200; port++) {
    try {
      const pid = execSync(`lsof -t -i:${port}`, { encoding: 'utf8' }).trim()
      if (pid) {
        execSync(`kill -9 ${pid}`, { stdio: 'pipe' })
        console.log(`[E2E Server] Killed process on port ${port}`)
      }
    } catch {
      // Port not in use or kill failed
    }
  }
}

/**
 * Helper function for async sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
