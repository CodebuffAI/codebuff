import { ServerWebSocket } from 'bun'

export type ClientState = {
  sessionId?: string
  lastSeen: number
  subscriptions: Set<string>
}

/** Tracks the relationship of clients to websockets and subscription lists. */
export class Switchboard {
  clients: Map<ServerWebSocket<ClientState>, ClientState>
  private allClientsDisconnectedPromise: Promise<true> | null = null
  private allClientsDisconnectedResolver: ((value: true) => void) | null = null

  constructor() {
    this.clients = new Map()
  }
  getClient(ws: ServerWebSocket<ClientState>) {
    const existing = this.clients.get(ws)
    if (existing == null) {
      throw new Error("Looking for a nonexistent client. Shouldn't happen.")
    }
    return existing
  }
  getAll() {
    return this.clients.entries()
  }
  getSubscribers(topic: string) {
    const entries = Array.from(this.clients.entries())
    return entries.filter(([_k, v]) => v.subscriptions.has(topic))
  }
  connect(ws: ServerWebSocket<ClientState>) {
    const existing = this.clients.get(ws)
    if (existing != null) {
      throw new Error("Client already connected! Shouldn't happen.")
    }
    this.clients.set(ws, {
      lastSeen: Date.now(),
      sessionId: `mc-client-` + Math.random().toString(36).slice(2, 15),
      subscriptions: new Set(),
    })
  }
  disconnect(ws: ServerWebSocket<ClientState>) {
    this.getClient(ws).sessionId = undefined
    this.clients.delete(ws)

    // If this was the last client, resolve the promise
    if (this.clients.size === 0 && this.allClientsDisconnectedResolver) {
      console.log('Last client disconnected. Resolving promise.')
      this.allClientsDisconnectedResolver(true)
      this.allClientsDisconnectedResolver = null
      this.allClientsDisconnectedPromise = Promise.resolve(true)
    }
  }
  markSeen(ws: ServerWebSocket<ClientState>) {
    this.getClient(ws).lastSeen = Date.now()
  }
  subscribe(ws: ServerWebSocket<ClientState>, ...topics: string[]) {
    const client = this.getClient(ws)
    for (const topic of topics) {
      client.subscriptions.add(topic)
    }
    this.markSeen(ws)
  }
  unsubscribe(ws: ServerWebSocket<ClientState>, ...topics: string[]) {
    const client = this.getClient(ws)
    for (const topic of topics) {
      client.subscriptions.delete(topic)
    }
    this.markSeen(ws)
  }

  // Note: This function assumes that new clients are
  // no longer being added to the switchboard after this is called
  waitForAllClientsDisconnected(): Promise<true> {
    // If there are no clients, resolve immediately
    if (this.clients.size === 0) {
      console.log('No clients connected. Resolving immediately.')
      return Promise.resolve(true)
    }

    // If we don't have a promise yet, create one
    if (
      !this.allClientsDisconnectedPromise ||
      this.allClientsDisconnectedPromise === Promise.resolve(true)
    ) {
      this.allClientsDisconnectedPromise = new Promise<true>((resolve) => {
        this.allClientsDisconnectedResolver = resolve
      })
    }

    return this.allClientsDisconnectedPromise
  }
}
