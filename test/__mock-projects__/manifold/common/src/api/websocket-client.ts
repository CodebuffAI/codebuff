import { ClientMessage, ClientMessageType, ServerMessage } from './websockets'

// mqp: useful for debugging
const VERBOSE_LOGGING = false

// mqp: no way should our server ever take 5 seconds to reply
const TIMEOUT_MS = 5000

const RECONNECT_WAIT_MS = 5000

type ConnectingState = typeof WebSocket.CONNECTING
type OpenState = typeof WebSocket.OPEN
type ClosingState = typeof WebSocket.CLOSING
type ClosedState = typeof WebSocket.CLOSED

export type ReadyState =
  | OpenState
  | ConnectingState
  | ClosedState
  | ClosingState

export function formatState(state: ReadyState) {
  switch (state) {
    case WebSocket.CONNECTING:
      return 'connecting'
    case WebSocket.OPEN:
      return 'open'
    case WebSocket.CLOSING:
      return 'closing'
    case WebSocket.CLOSED:
      return 'closed'
    default:
      throw new Error('Invalid websocket state.')
  }
}

export type BroadcastHandler = (msg: ServerMessage<'broadcast'>) => void

type OutstandingTxn = {
  resolve: () => void
  reject: (err: Error) => void
  timeout?: NodeJS.Timeout
}

/** Client for the API websocket realtime server. Automatically manages reconnection
 * and resubscription on disconnect, and allows subscribers to get a callback
 * when something is broadcasted. */
export class APIRealtimeClient {
  ws!: WebSocket
  url: string
  txid: number
  // all txns that are in flight, with no ack/error/timeout
  txns: Map<number, OutstandingTxn>
  // subscribers by the topic they are subscribed to
  subscriptions: Map<string, BroadcastHandler[]>
  connectTimeout?: NodeJS.Timeout
  heartbeat?: NodeJS.Timeout

  constructor(url: string) {
    this.url = url
    this.txid = 0
    this.txns = new Map()
    this.subscriptions = new Map()
    this.connect()
  }

  get state() {
    return this.ws.readyState as ReadyState
  }

  close() {
    this.ws.close(1000, 'Closed manually.')
    clearTimeout(this.connectTimeout)
  }

  connect() {
    // you may wish to refer to https://websockets.spec.whatwg.org/
    // in order to check the semantics of events etc.
    this.ws = new WebSocket(this.url)
    this.ws.onmessage = (ev) => {
      this.receiveMessage(JSON.parse(ev.data))
    }
    this.ws.onerror = (ev) => {
      console.error('API websocket error: ', ev)
      // this can fire without an onclose if this is the first time we ever try
      // to connect, so we need to turn on our reconnect in that case
      this.waitAndReconnect()
    }
    this.ws.onopen = (_ev) => {
      if (VERBOSE_LOGGING) {
        console.info('API websocket opened.')
      }
      this.heartbeat = setInterval(
        async () => this.sendMessage('ping', {}).catch(console.error),
        30000
      )
      if (this.subscriptions.size > 0) {
        this.sendMessage('subscribe', {
          topics: Array.from(this.subscriptions.keys()),
        }).catch(console.error)
      }
    }
    this.ws.onclose = (ev) => {
      // note that if the connection closes due to an error, onerror fires and then this
      if (VERBOSE_LOGGING) {
        console.info(`API websocket closed with code=${ev.code}: ${ev.reason}`)
      }
      clearInterval(this.heartbeat)

      // mqp: we might need to change how the txn stuff works if we ever want to
      // implement "wait until i am subscribed, and then do something" in a component.
      // right now it cannot be reliably used to detect that in the presence of reconnects
      for (const txn of Array.from(this.txns.values())) {
        clearTimeout(txn.timeout)
        txn.reject(new Error('Websocket was closed.'))
      }
      this.txns.clear()

      // 1000 is RFC code for normal on-purpose closure
      if (ev.code !== 1000) {
        this.waitAndReconnect()
      }
    }
  }

  waitAndReconnect() {
    if (this.connectTimeout == null) {
      this.connectTimeout = setTimeout(() => {
        this.connectTimeout = undefined
        this.connect()
      }, RECONNECT_WAIT_MS)
    }
  }

  receiveMessage(msg: ServerMessage) {
    if (VERBOSE_LOGGING) {
      console.info('< Incoming API websocket message: ', msg)
    }
    switch (msg.type) {
      case 'broadcast': {
        const handlers = this.subscriptions.get(msg.topic)
        if (handlers == null) {
          // it's not exceptional for a message to come in with no handlers --
          // maybe the server didn't get our unsubscribe yet
          return
        }
        for (const handler of handlers) {
          handler(msg)
        }
        return
      }
      case 'ack': {
        if (msg.txid != null) {
          const txn = this.txns.get(msg.txid)
          if (txn == null) {
            // mqp: only reason this should happen is getting an ack after timeout
            console.warn(`Websocket message with old txid=${msg.txid}.`)
          } else {
            clearTimeout(txn.timeout)
            if (msg.error != null) {
              txn.reject(new Error(msg.error))
            } else {
              txn.resolve()
            }
            this.txns.delete(msg.txid)
          }
        }
        return
      }
      default:
        console.warn(`Unknown API websocket message type received: ${msg}`)
    }
  }

  async sendMessage<T extends ClientMessageType>(
    type: T,
    data: Omit<ClientMessage<T>, 'type' | 'txid'>
  ) {
    if (VERBOSE_LOGGING) {
      console.info(`> Outgoing API websocket ${type} message: `, data)
    }
    if (this.state === WebSocket.OPEN) {
      return new Promise<void>((resolve, reject) => {
        const txid = this.txid++
        const timeout = setTimeout(() => {
          this.txns.delete(txid)
          reject(new Error(`Websocket message with txid ${txid} timed out.`))
        }, TIMEOUT_MS)
        this.txns.set(txid, { resolve, reject, timeout })
        this.ws.send(JSON.stringify({ type, txid, ...data }))
      })
    } else {
      // expected if components in the code try to subscribe or unsubscribe
      // while the socket is closed -- in this case we expect to get the state
      // fixed up in the websocket onopen handler when we reconnect
    }
  }

  async identify(uid: string) {
    return await this.sendMessage('identify', { uid })
  }

  async subscribe(topics: string[], handler: BroadcastHandler) {
    for (const topic of topics) {
      let existingHandlers = this.subscriptions.get(topic)
      if (existingHandlers == null) {
        this.subscriptions.set(topic, (existingHandlers = [handler]))
        return await this.sendMessage('subscribe', { topics: [topic] })
      } else {
        existingHandlers.push(handler)
      }
    }
  }

  async unsubscribe(topics: string[], handler: BroadcastHandler) {
    for (const topic of topics) {
      const existingHandlers = this.subscriptions.get(topic)
      if (existingHandlers == null) {
        console.error(`Subscription mapping busted -- ${topic} handlers null.`)
      } else {
        const remainingHandlers = existingHandlers.filter((h) => h != handler)
        if (remainingHandlers.length > 0) {
          this.subscriptions.set(topic, remainingHandlers)
        } else {
          this.subscriptions.delete(topic)
          return await this.sendMessage('unsubscribe', { topics: [topic] })
        }
      }
    }
  }
}
