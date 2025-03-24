import { WebSocket } from 'ws'

import { ServerAction, ClientAction } from '../actions'
import {
  ClientMessage,
  ClientMessageType,
  ServerMessage,
} from './websocket-schema'

// mqp: useful for debugging
const VERBOSE_LOGGING = false

const TIMEOUT_MS = 120_000

const RECONNECT_WAIT_MS = 5_000

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

type OutstandingTxn = {
  resolve: () => void
  reject: (err: Error) => void
  timeout?: any
}

/** Client for the API websocket realtime server. Automatically manages reconnection
 * and resubscription on disconnect, and allows subscribers to get a callback
 * when something is broadcasted. */
export class APIRealtimeClient {
  ws!: WebSocket
  url: string
  // Callbacks subscribed to individual actions.
  subscribers: Map<ServerAction['type'], ((action: ServerAction) => void)[]>
  txid: number
  // all txns that are in flight, with no ack/error/timeout
  txns: Map<number, OutstandingTxn>
  connectTimeout?: any
  heartbeat?: any
  hadError = false
  onError: () => void
  onReconnect: () => void

  constructor(url: string, onError: () => void, onReconnect: () => void) {
    this.url = url
    this.txid = 0
    this.txns = new Map()
    this.subscribers = new Map()
    this.onError = onError
    this.onReconnect = onReconnect
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
      if (this.hadError) {
        this.hadError = false
        this.onReconnect()
      }
      this.receiveMessage(JSON.parse(ev.data as any))
    }
    this.ws.onerror = (ev) => {
      if (!this.hadError) {
        this.onError()
        this.hadError = true
      }
      // this can fire without an onclose if this is the first time we ever try
      // to connect, so we need to turn on our reconnect in that case
      this.waitAndReconnect()
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
        // NOTE (James): Don't throw an error when the websocket is closed...
        // This seems to be happening, but the client can recover.
        txn.resolve()
        // txn.reject(new Error('Websocket was closed.'))
      }
      this.txns.clear()

      // 1000 is RFC code for normal on-purpose closure
      if (ev.code !== 1000) {
        this.waitAndReconnect()
      }
    }
    return new Promise<void>((resolve) => {
      this.ws.onopen = (_ev) => {
        if (VERBOSE_LOGGING) {
          console.info('API websocket opened.')
        }
        this.heartbeat = setInterval(
          async () => this.sendMessage('ping', {}).catch(() => {}),
          30000
        )

        resolve()
      }
    })
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
      case 'action': {
        const action = msg.data
        const subscribers = this.subscribers.get(action.type) ?? []
        for (const callback of subscribers) {
          callback(action)
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

  async sendAction(action: ClientAction) {
    try {
      return await this.sendMessage('action', {
        data: action,
      })
    } catch (e) {
      // Print the error message for debugging.
      console.error(
        'Error sending action:',
        action.type,
        typeof e === 'object' && e !== null && 'message' in e ? e.message : e
      )

      console.log()
      console.log('Codebuff is exiting due to an error.')
      console.log('Make sure you are on the latest version of Codebuff!')
      console.log('-----------------------------------')
      console.log('Please run: npm install -g codebuff')
      console.log('-----------------------------------')

      process.exit(1)
    }
  }

  subscribe<T extends ServerAction['type']>(
    action: T,
    callback: (action: Extract<ServerAction, { type: T }>) => void
  ) {
    const currSubscribers = this.subscribers.get(action) ?? []
    this.subscribers.set(action, [
      ...currSubscribers,
      callback as (action: ServerAction) => void,
    ])

    return () => {
      const newSubscribers = currSubscribers.filter((cb) => cb !== callback)
      this.subscribers.set(action, newSubscribers)
    }
  }
}
