import { setupBigQuery } from '@codebuff/bigquery'
import { flushAnalytics, initAnalytics } from '@codebuff/common/analytics'
import { utils, env } from '@codebuff/internal'
import type { ServerWebSocket } from 'bun'

import {
  getTracesForUserHandler,
  relabelForUserHandler,
} from './admin/relabelRuns'
import { isRepoCoveredHandler } from './api/org'
import usageHandler from './api/usage'
import { logger } from './util/logger'
import {
  sendRequestReconnect,
  waitForAllClientsDisconnected,
  SWITCHBOARD,
  processMessage,
  sendMessage,
  startConnectionCleaner,
  stopConnectionCleaner,
} from './websockets/server'
import { ClientState } from './websockets/switchboard'

const port = env.PORT

// CORS headers helper
function addCorsHeaders(response: Response): Response {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  )
  return response
}

// HTTP request handler
async function handleHttpRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const { pathname, method } = { pathname: url.pathname, method: req.method }

  try {
    // Handle CORS preflight requests
    if (method === 'OPTIONS') {
      return addCorsHeaders(new Response(null, { status: 204 }))
    }

    // Root endpoint
    if (pathname === '/' && method === 'GET') {
      return new Response('Codebuff Backend Server')
    }

    // Health check
    if (pathname === '/healthz' && method === 'GET') {
      return new Response('ok')
    }

    // API endpoints
    if (pathname === '/api/usage' && method === 'POST') {
      try {
        const body = await req.json()
        const result = await usageHandler(body)
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        logger.error({ error }, 'Error in /api/usage')
        if (
          error instanceof Error &&
          error.message.includes('Invalid request body')
        ) {
          return new Response(JSON.stringify({ message: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(
          JSON.stringify({ message: 'Internal Server Error' }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    if (pathname === '/api/orgs/is-repo-covered' && method === 'POST') {
      try {
        const body = await req.json()
        const authHeader = req.headers.get('authorization')
        const result = await isRepoCoveredHandler(body, authHeader)
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error) {
        logger.error({ error }, 'Error in /api/orgs/is-repo-covered')
        if (
          error instanceof Error &&
          error.message.includes('Invalid request body')
        ) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(
          JSON.stringify({ error: 'Internal Server Error' }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Admin endpoints with auth
    if (pathname === '/api/admin/relabel-for-user') {
      const authHeader = req.headers.get('authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return addCorsHeaders(
          new Response(
            JSON.stringify({
              error: 'Missing or invalid Authorization header',
            }),
            {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        )
      }

      const authToken = authHeader.substring(7)

      // Check admin auth
      const adminCheck = await utils.checkAdminAuth(authToken)
      if (!adminCheck.success) {
        return addCorsHeaders(
          new Response(JSON.stringify({ error: adminCheck.error }), {
            status: adminCheck.status,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      }

      if (method === 'GET') {
        try {
          const userId = url.searchParams.get('userId')
          const result = await getTracesForUserHandler(userId)
          return addCorsHeaders(
            new Response(JSON.stringify(result), {
              headers: { 'Content-Type': 'application/json' },
            })
          )
        } catch (error) {
          logger.error({ error }, 'Error in GET /api/admin/relabel-for-user')
          return addCorsHeaders(
            new Response(
              JSON.stringify({ error: 'Failed to fetch traces and relabels' }),
              {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          )
        }
      }

      if (method === 'POST') {
        try {
          const userId = url.searchParams.get('userId')
          const body = await req.json()
          const result = await relabelForUserHandler(userId, body)
          return addCorsHeaders(
            new Response(JSON.stringify(result), {
              headers: { 'Content-Type': 'application/json' },
            })
          )
        } catch (error) {
          logger.error({ error }, 'Error in POST /api/admin/relabel-for-user')
          return addCorsHeaders(
            new Response(
              JSON.stringify({ error: 'Failed to relabel traces' }),
              {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          )
        }
      }
    }

    // 404 for unmatched routes
    return new Response('Not Found', { status: 404 })
  } catch (error) {
    logger.error({ error }, 'HTTP request error')
    return new Response('Internal Server Error', { status: 500 })
  }
}

logger.info('Initializing server')

// Initialize BigQuery before starting the server
logger.info('Starting BigQuery initialization...')
setupBigQuery()
  .catch((err) => {
    logger.error(
      {
        error: err,
        stack: err.stack,
        message: err.message,
        name: err.name,
        code: err.code,
        details: err.details,
      },
      'Failed to initialize BigQuery client'
    )
  })
  .finally(() => {
    logger.debug('BigQuery initialization completed')
  })

logger.info('Initializing analytics...')
initAnalytics()

let shutdownInProgress = false

// Graceful shutdown handler
function handleShutdown(signal: string, server: ReturnType<typeof Bun.serve>) {
  flushAnalytics()
  if (env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev') {
    console.log('\nLocal environment detected. Not awaiting client exits.')
    server.stop()
    process.exit(0)
  }
  if (shutdownInProgress) {
    console.log(`\nReceived ${signal}. Already shutting down...`)
    return
  }
  shutdownInProgress = true
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`)

  // Don't shutdown, instead ask clients to disconnect from us
  sendRequestReconnect()

  waitForAllClientsDisconnected().then(() => {
    console.log('All clients disconnected. Shutting down...')
    stopConnectionCleaner()
    process.exit(0)
  })

  // If graceful shutdown is not achieved after 5 minutes,
  // force exit the process
  setTimeout(() => {
    console.error(
      'Could not close connections in time, forcefully shutting down'
    )
    process.exit(1)
  }, 300000).unref()
}

// Bun server with native WebSocket support
const server = Bun.serve({
  port,
  async fetch(req, server) {
    // Handle WebSocket upgrade
    if (server.upgrade(req)) {
      return // WebSocket upgrade handled
    }

    // Handle regular HTTP requests natively
    return await handleHttpRequest(req)
  },
  websocket: {
    open(ws: ServerWebSocket<ClientState>) {
      logger.debug('WebSocket client connected')
      SWITCHBOARD.connect(ws)
      startConnectionCleaner()
    },
    async message(ws: ServerWebSocket<ClientState>, message) {
      const clientSessionId =
        SWITCHBOARD.clients.get(ws)?.sessionId ?? 'bun-client-unknown'
      const result = await processMessage(ws, clientSessionId, message)
      sendMessage(ws, result)
    },
    close(ws: ServerWebSocket<ClientState>, code, reason) {
      logger.debug({ code, reason }, 'WebSocket client disconnected')
      SWITCHBOARD.disconnect(ws)
    },
  },
})

console.log(`🚀 Bun server is running on port ${port}`)
process.on('SIGTERM', () => handleShutdown('SIGTERM', server))
process.on('SIGINT', () => handleShutdown('SIGINT', server))

process.on('unhandledRejection', (reason, promise) => {
  // Don't rethrow the error, just log it. Keep the server running.
  const stack = reason instanceof Error ? reason.stack : undefined
  const message = reason instanceof Error ? reason.message : undefined
  const name = reason instanceof Error ? reason.name : undefined
  console.error('unhandledRejection', message, reason, stack)
  logger.error(
    {
      reason,
      stack,
      message,
      name,
      promise,
    },
    `Unhandled promise rejection: ${reason instanceof Error ? reason.message : 'Unknown reason'}`
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
    {
      err,
      stack: err.stack,
      message: err.message,
      name: err.name,
      origin,
    },
    'uncaught exception detected'
  )

  // Graceful shutdown attempt
  process.exit(1)

  // If a graceful shutdown is not achieved after 1 second,
  // shut down the process completely
  setTimeout(() => {
    process.abort() // exit immediately and generate a core dump file
  }, 1000).unref()
  process.exit(1)
})
