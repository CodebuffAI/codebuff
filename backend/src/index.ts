import { setupBigQuery } from '@codebuff/bigquery'
import { flushAnalytics, initAnalytics } from '@codebuff/common/analytics'
import { env } from '@codebuff/internal'

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

// Express-like tiny router
type Handler = (
  req: Request,
  utils: { json: typeof ok; text: typeof text },
) => Promise<Response> | Response

function text(body: string, status = 200) {
  return new Response(body, { status })
}

function ok(body: any, init?: ResponseInit) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  })
}

// Delete routes array; replace with routeKey/routeTable for O(1) lookup
// const routes: Array<{ method: string; path: string; handler: Handler }> = []
const routeKey = (method: string, path: string) => `${method} ${path}`
const routeTable: Record<string, Handler> = {}

const router = {
  get: (path: string, handler: Handler) =>
    (routeTable[routeKey('GET', path)] = handler),
  post: (path: string, handler: Handler) =>
    (routeTable[routeKey('POST', path)] = handler),
  options: (path: string, handler: Handler) =>
    (routeTable[routeKey('OPTIONS', path)] = handler),
}

// Reuse a shared utils object instead of creating per request
const utils = { json: ok, text }

// Routes
router.get('/', (_req, { text }) => text('Codebuff Backend Server'))
router.get('/healthz', (_req, { text }) => text('ok'))

router.post('/api/usage', (req, { json }) => usageHandler(req, json))
router.post('/api/orgs/is-repo-covered', (req, { json }) =>
  isRepoCoveredHandler(req, json),
)

router.options('/api/admin/relabel-for-user', () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
})

router.get('/api/admin/relabel-for-user', async (req, { json }) => {
  await checkAdmin(req)
  return getTracesForUserHandler(req, json)
})

router.post('/api/admin/relabel-for-user', async (req, { json }) => {
  await checkAdmin(req)
  return relabelForUserHandler(req, json)
})

async function handleWithRouter(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const method = req.method.toUpperCase()

  const handler = routeTable[routeKey(method, url.pathname)]
  if (handler) {
    return await handler(req, utils)
  }
  return new Response('Not Found', { status: 404 })
}

const server = Bun.serve({
  port,
  fetch: async (req, server) => {
    const url = new URL(req.url)
    if (url.pathname === '/ws') {
      if (server.upgrade(req, { data: {} })) return undefined
      return new Response('Upgrade failed', { status: 426 })
    }

    try {
      // Delegate to express-like router
      return await handleWithRouter(req)
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
