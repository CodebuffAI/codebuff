import WebSocket from 'ws'

export function createWebSocketClient(url: string) {
  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(url)

    ws.on('open', () => {
      console.log('Connected to WebSocket server')
      resolve(ws)
    })

    ws.on('error', (error) => {
      console.error('WebSocket connection error:', error)
      reject(error)
    })
  })
}

export function sendPrompt(ws: WebSocket, prompt: string, options: { system?: string } = {}) {
  return new Promise<string>((resolve, reject) => {
    let fullResponse = ''

    ws.send(JSON.stringify({ prompt, options }))

    const messageHandler = (data: WebSocket.Data) => {
      const message = JSON.parse(data.toString())
      if (message.error) {
        console.error('Error:', message.error)
        reject(new Error(message.error))
      } else if (message.status) {
        console.log('Status:', message.status)
      } else if (message.type === 'chunk') {
        process.stdout.write(message.content)
        fullResponse += message.content
      } else if (message.type === 'done') {
        console.log('\nClaude response complete')
        ws.removeListener('message', messageHandler)
        resolve(fullResponse)
      }
    }

    ws.on('message', messageHandler)
  })
}