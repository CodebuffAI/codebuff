import express from 'express'
import dotenv from 'dotenv'
import http from 'http'
import WebSocket from 'ws'
import { promptClaudeStream } from './claude'

dotenv.config()

const app = express()
const port = process.env.PORT || 3000

app.use(express.json())

app.get('/', (req, res) => {
  res.send('Manicode Backend Server')
})

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack)
  res.status(500).send('Something broke!')
})

const server = http.createServer(app)

const wss = new WebSocket.Server({ server })

wss.on('connection', (ws: WebSocket) => {
  console.log('New WebSocket connection')

  ws.on('message', async (message: string) => {
    console.log('Received:', message)
    
    try {
      const { prompt, options } = JSON.parse(message.toString())
      if (!prompt) {
        ws.send(JSON.stringify({ error: 'Invalid message format. Expected { prompt: string, options?: object }' }))
        return
      }

      ws.send(JSON.stringify({ status: 'Processing prompt' }))

      for await (const chunk of promptClaudeStream(prompt, options)) {
        ws.send(JSON.stringify({ type: 'chunk', content: chunk }))
      }

      ws.send(JSON.stringify({ type: 'done' }))
    } catch (error) {
      console.error('Error processing message:', error)
      ws.send(JSON.stringify({ error: 'Error processing message' }))
    }
  })

  ws.send(JSON.stringify({ status: 'Connected to Manicode WebSocket server' }))
})

server.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})