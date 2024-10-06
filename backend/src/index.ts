import express from 'express'
import http from 'http'
import { listen as webSocketListen } from './websockets/server'
import { env } from './env.mjs'
import { logger } from './util/logger'

const app = express()
const port = env.PORT

app.use(express.json())

app.get('/', (req, res) => {
  res.send('Manicode Backend Server')
})

app.get('/healthz', (req, res) => {
  res.send('ok')
})

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
const server = http.createServer(app)

server.listen(port, () => {
  logger.info(`Server is running on port ${port}`)
})

webSocketListen(server, '/ws')

process.on('SIGINT', () => {
  process.exit()
})
