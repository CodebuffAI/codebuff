import { setupBigQuery } from '@codebuff/bigquery'
import { flushAnalytics, initAnalytics } from '@codebuff/common/analytics'
import cors from 'cors'
import express from 'express'
import type { ServerWebSocket } from 'bun'

import {
  getTracesForUserHandler,
  relabelForUserHandler,
} from './admin/relabelRuns'
import usageHandler from './api/usage'
import { isRepoCoveredHandler } from './api/org'
import { env } from '@codebuff/internal'
import { checkAdmin } from './util/check-auth'
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

const app = express()
const port = env.PORT

app.use(express.json())

app.get('/', (req, res) => {
  res.send('Codebuff Backend Server')
})

app.get('/healthz', (req, res) => {
  res.send('ok')
})

app.post('/api/usage', usageHandler)
app.post('/api/orgs/is-repo-covered', isRepoCoveredHandler)

// Enable CORS for preflight requests to the admin relabel endpoint
app.options('/api/admin/relabel-for-user', cors())

// Add the admin routes with CORS and auth
app.get(
  '/api/admin/relabel-for-user',
  cors(),
  checkAdmin,
  getTracesForUserHandler
)

app.post(
  '/api/admin/relabel-for-user',
  cors(),
  checkAdmin,
  relabelForUserHandler
)

app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    logger.error({ err }, 'Something broke!')
    res.status(500).send('Something broke!')
  }
)

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

    // Handle regular HTTP requests through Express
    return new Promise((resolve) => {
      const mockRes = {
        end: (body: any) => resolve(new Response(body)),
        setHeader: () => {},
        status: (code: number) => ({
          json: (data: any) => resolve(new Response(JSON.stringify(data), { status: code, headers: { 'Content-Type': 'application/json' } })),
          send: (data: any) => resolve(new Response(data, { status: code }))
        }),
        json: (data: any) => resolve(new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })),
        send: (data: any) => resolve(new Response(data))
      } as any
      
      app(req as any, mockRes)
    })
  },
  websocket: {
    open(ws: ServerWebSocket<ClientState>) {
      logger.debug('WebSocket client connected')
      SWITCHBOARD.connect(ws)
      startConnectionCleaner()
    },
    async message(ws: ServerWebSocket<ClientState>, message) {
      const clientSessionId = SWITCHBOARD.clients.get(ws)?.sessionId ?? 'bun-client-unknown'
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
