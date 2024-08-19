import express from 'express'
import dotenv from 'dotenv'
import http from 'http'
import { listen as webSocketListen } from './websockets/server'
import { debugLog } from './util/debug'

dotenv.config()

const app = express()
const port = process.env.PORT || 4242

app.use(express.json())

app.get('/', (req, res) => {
  res.send('Manicode Backend Server')
})

app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error(err.stack)
    res.status(500).send('Something broke!')
  }
)

console.log('init server')
const server = http.createServer(app)

server.listen(port, () => {
  console.log(`Server is running on port ${port}`)
  debugLog(`Server started on port ${port}`)
})

webSocketListen(server, '/ws')

process.on('SIGINT', () => {
  process.exit()
})
