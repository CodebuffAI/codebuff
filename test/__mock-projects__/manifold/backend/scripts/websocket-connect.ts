import { APIRealtimeClient } from 'common/api/websocket-client'
import { runScript } from 'run-script'
import { log } from 'shared/utils'

function waitForConnected(client: APIRealtimeClient) {
  return new Promise<APIRealtimeClient>((resolve) => {
    switch (client.state) {
      case WebSocket.OPEN:
        return resolve(client)
      default: {
        const waitTimer = setInterval(() => {
          if (client.state === WebSocket.OPEN) {
            clearInterval(waitTimer)
            resolve(client)
          }
        }, 10)
        return
      }
    }
  })
}

async function subscribeWebsocket(url: string, topics: string[]) {
  log.info(`Connecting to ${url}...`)
  const client = await waitForConnected(new APIRealtimeClient(url))
  log.info(`Connected to ${url}. Subscribing to: [${topics.join(', ')}]`)
  client.subscribe(topics, (msg) => {
    log.info(JSON.stringify(msg, null, 2))
  })
}

if (require.main === module) {
  runScript(async () => {
    const topics = process.argv.length > 3 ? process.argv.slice(3) : ['*']
    await subscribeWebsocket(process.argv[2], topics)
    return new Promise(() => {}) // just go forever
  })
}
