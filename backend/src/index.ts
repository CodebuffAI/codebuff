import {
  getTracesForUserHandler,
  relabelForUserHandler,
} from './admin/relabelRuns'
import { isRepoCoveredHandler } from './api/org'
import usageHandler from './api/usage'
import { checkAdmin } from './util/check-auth'
import { logger } from './util/logger'
import {
  sendRequestReconnect,
  waitForAllClientsDisconnected,
  handleWsOpen,
  handleWsMessage,
  handleWsClose,
  startDeadConnectionCleaner,
} from './websockets/server'
import { setupBigQuery } from '@codebuff/bigquery'
import { flushAnalytics, initAnalytics } from '@codebuff/common/analytics'
import { env } from '@codebuff/internal'

const port = env.PORT

setupBigQuery().catch((err) => {
  logger.error(
    {
      error: err,
      stack: err.stack,
      message: err.message,
      name: err.name,
      code: (err as any).code,
      details: (err as any).details,
    },
    'Failed to initialize BigQuery client',
  )
})

initAnalytics()

const server = Bun.serve({
  port,
  fetch: async (req, server) => {
    const url = new URL(req.url)
    if (url.pathname === '/ws') {
      if (server.upgrade(req, { data: {} })) return undefined
      return new Response('Upgrade failed', { status: 426 })
    }

    // Pure Bun routing
    try {
      // CORS preflight for admin endpoint
      if (
        req.method === 'OPTIONS' &&
        url.pathname === '/api/admin/relabel-for-user'
      ) {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        })
      }

      if (url.pathname === '/') return new Response('Codebuff Backend Server')
      if (url.pathname === '/healthz') return new Response('ok')

      // JSON helpers
      const json = async <T = any>() => (await req.json()) as T
      const ok = (body: any, init?: ResponseInit) =>
        new Response(typeof body === 'string' ? body : JSON.stringify(body), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...(init?.headers || {}),
          },
          ...init,
        })

      // Map previous handlers
      if (req.method === 'POST' && url.pathname === '/api/usage') {
        return await usageHandler(req, ok)
      }
      if (
        req.method === 'POST' &&
        url.pathname === '/api/orgs/is-repo-covered'
      ) {
        return await isRepoCoveredHandler(req, ok)
      }
      if (url.pathname === '/api/admin/relabel-for-user') {
        // Minimal auth check
        await checkAdmin(req)
        if (req.method === 'GET') return await getTracesForUserHandler(req, ok)
        if (req.method === 'POST') return await relabelForUserHandler(req, ok)
      }

      return new Response('Not Found', { status: 404 })
    } catch (err) {
      const status = (err as any)?.status ?? 500
      const message = (err as any)?.message ?? 'Something broke!'
      logger.error({ err, path: url.pathname, status }, 'HTTP handler error')
      return new Response(message, { status })
    }
  },
  websocket: {
    open(ws) {
      handleWsOpen(ws as any)
    },
    message(ws, msg) {
      handleWsMessage(ws as any, msg as any)
    },
    close(ws) {
      handleWsClose(ws as any)
    },
  },
})

console.log(`🚀 Server is running on port ${port}`)
logger.debug(`🚀 Server is running on port ${port}`)

// Optional: cleaner for dead connections
const cleanup = startDeadConnectionCleaner({
  clients: (server as any).websocket?.clients ?? new Set(),
})

let shutdownInProgress = false
function handleShutdown(signal: string) {
  flushAnalytics()
  if (env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev') {
    try {
      server.stop()
    } catch {}
    process.exit(0)
  }
  if (shutdownInProgress) {
    console.log(`\nReceived ${signal}. Already shutting down...`)
    return
  }
  shutdownInProgress = true
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`)

  sendRequestReconnect()

  waitForAllClientsDisconnected().then(() => {
    console.log('All clients disconnected. Shutting down...')
    try {
      cleanup()
    } catch {}
    try {
      server.stop()
    } catch {}
    process.exit(0)
  })

  setTimeout(() => {
    console.error(
      'Could not close connections in time, forcefully shutting down',
    )
    try {
      cleanup()
    } catch {}
    try {
      server.stop()
    } catch {}
    process.exit(1)
  }, 300000).unref()
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'))
process.on('SIGINT', () => handleShutdown('SIGINT'))

process.on('unhandledRejection', (reason, promise) => {
  const stack = reason instanceof Error ? reason.stack : undefined
  const message = reason instanceof Error ? reason.message : undefined
  const name = reason instanceof Error ? reason.name : undefined
  console.error('unhandledRejection', message, reason, stack)
  logger.error(
    { reason, stack, message, name, promise },
    `Unhandled promise rejection: ${reason instanceof Error ? reason.message : 'Unknown reason'}`,
  )
})

process.on('uncaughtException', (err, origin) => {
  console.error('uncaughtException', {
    error: err,
    message: err.message,
    stack: err.stack,
    name: err.name,
    origin,
  })
  logger.fatal(
    { err, stack: err.stack, message: err.message, name: err.name, origin },
    'uncaught exception detected',
  )
  try {
    server.stop()
  } catch {}
  setTimeout(() => {
    process.abort()
  }, 1000).unref()
  process.exit(1)
})
