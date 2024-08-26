import { APIRealtimeClient } from 'common/api/websocket-client'
import { runScript } from 'run-script'
import { log } from 'shared/utils'
import { sample } from 'lodash'

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

async function subscribeToSomething(client: APIRealtimeClient) {
  const topic = crypto.randomUUID()
  await client.subscribe([topic], (msg) => {
    log.debug(`Received message on ${topic}: ${JSON.stringify(msg)}`)
  })
  log.info(`Subscribed handler to ${topic}.`)
  return topic
}

async function unsubscribeFromSomething(client: APIRealtimeClient) {
  const [topic, handlers] = sample(Array.from(client.subscriptions.entries()))!
  const handler = sample(handlers)!
  await client.unsubscribe([topic], handler)
  log.info(`Unsubscribed handler from ${topic}.`)
}

async function broadcastSomething(client: APIRealtimeClient, testUrl: string) {
  const topic = sample(Array.from(client.subscriptions.keys()))!
  const resp = fetch(testUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, message: {} }),
  })
  log.debug(`Broadcasted message to ${topic}.`)
  await resp
}

async function testWebsocket(address: string) {
  const wsUrl = `ws://${address}/ws`
  log.info(`Connecting to ${wsUrl}...`)
  const client = await waitForConnected(new APIRealtimeClient(wsUrl))
  log.info(`Connected to ${wsUrl}.`)

  return setInterval(() => {
    const n = Math.random()
    try {
      if (client.subscriptions.size == 0 || n < 0.05) {
        subscribeToSomething(client)
      } else if (n < 0.1) {
        unsubscribeFromSomething(client)
      }
      if (client.subscriptions.size > 0) {
        broadcastSomething(client, `http://${address}/broadcast-test`)
      }
    } catch (err) {
      log.error(err)
    }
  }, 200)
}

if (require.main === module) {
  runScript(async () => {
    await testWebsocket(process.argv[2] ?? 'localhost:8088')
    return new Promise(() => {}) // just go forever
  })
}
