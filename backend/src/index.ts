import http from 'http'

import { setupBigQuery } from '@codebuff/bigquery'
import { flushAnalytics, initAnalytics } from '@codebuff/common/analytics'
import { env } from '@codebuff/internal'
import cors from 'cors'
import express from 'express'

import {
  getTracesForUserHandler,
  relabelForUserHandler,
} from './admin/relabelRuns'
import { validateAgentNameHandler } from './api/agents'
import { isRepoCoveredHandler } from './api/org'
import usageHandler from './api/usage'
import { checkAdmin } from './util/check-auth'
import { logger } from './util/logger'
import {
  sendRequestReconnect,
  waitForAllClientsDisconnected,
  listen as webSocketListen,
} from './websockets/server'

// Grace period for graceful shutdown
const SHUTDOWN_GRACE_PERIOD_MS = 30 * 60 * 1000

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
app.get('/api/agents/validate-name', validateAgentNameHandler)

// Enable CORS for preflight requests to the admin relabel endpoint
app.options('/api/admin/relabel-for-user', cors())

// Add the admin routes with CORS and auth
app.get(
  '/api/admin/relabel-for-user',
  cors(),
  checkAdmin,
  getTracesForUserHandler,
)

app.post(
  '/api/admin/relabel-for-user',
  cors(),
  checkAdmin,
  relabelForUserHandler,
)

app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    logger.error({ err }, 'Something broke!')
    res.status(500).send('Something broke!')
  },
)

// Initialize BigQuery before starting the server
setupBigQuery().catch((err) => {
  logger.error(
    {
      error: err,
      stack: err.stack,
      message: err.message,
      name: err.name,
      code: err.code,
      details: err.details,
    },
    'Failed to initialize BigQuery client',
  )
})

initAnalytics()

const server = http.createServer(app)

server.listen(port, () => {
  logger.debug(`🚀 Server is running on port ${port}`)
  console.log(`🚀 Server is running on port ${port}`)
})
webSocketListen(server, '/ws')

// Add periodic storage and memory monitoring for diagnosing eval storage issues
setInterval(() => {
  const memUsage = process.memoryUsage()
  const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2)
  const rssMB = (memUsage.rss / 1024 / 1024).toFixed(2)
  const externalMB = (memUsage.external / 1024 / 1024).toFixed(2)
  
  console.log(`[STORAGE-DEBUG] Memory usage: heap=${heapUsedMB}MB, rss=${rssMB}MB, external=${externalMB}MB`)
  
  // Log if memory usage is high
  if (memUsage.heapUsed > 2000 * 1024 * 1024) { // > 2GB
    console.log(`[STORAGE-DEBUG] HIGH MEMORY USAGE DETECTED: ${heapUsedMB}MB heap`)
  }
}, 30000) // Every 30 seconds

let shutdownInProgress = false
// Graceful shutdown handler for both SIGTERM and SIGINT
async function handleShutdown(signal: string) {
  flushAnalytics()
  if (env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev') {
    server.close((error) => {
      console.log('Received error closing server', { error })
    })
    process.exit(0)
  }
  if (shutdownInProgress) {
    console.log(`\nReceived ${signal}. Already shutting down...`)
    return
  }
  shutdownInProgress = true
  console.log(
    `\nReceived ${signal}. Starting ${SHUTDOWN_GRACE_PERIOD_MS / 60000} minute graceful shutdown period...`,
  )

  // Don't shutdown, instead ask clients to disconnect from us
  sendRequestReconnect()

  waitForAllClientsDisconnected().then(() => {
    console.log('All clients disconnected. Shutting down...')
    process.exit(0)
  })

  // Wait for the grace period to allow clients to switch to new instances
  await new Promise((resolve) => setTimeout(resolve, SHUTDOWN_GRACE_PERIOD_MS))

  console.log('Grace period over. Proceeding with final shutdown...')

  process.exit(1)
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'))
process.on('SIGINT', () => handleShutdown('SIGINT'))

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
    {
      err,
      stack: err.stack,
      message: err.message,
      name: err.name,
      origin,
    },
    'uncaught exception detected',
  )

  server.close(() => {
    process.exit(1)
  })

  // If a graceful shutdown is not achieved after 1 second,
  // shut down the process completely
  setTimeout(() => {
    process.abort() // exit immediately and generate a core dump file
  }, 1000).unref()
  process.exit(1)
})
