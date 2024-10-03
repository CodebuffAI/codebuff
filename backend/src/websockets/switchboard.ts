import { WebSocket } from 'ws'

export type ClientState = {
  sessionId?: string
  lastSeen: number
  subscriptions: Set<string>
}

/** Tracks the relationship of clients to websockets and subscription lists. */
export class Switchboard {
  clients: Map<WebSocket, ClientState>
  constructor() {
    this.clients = new Map()
  }
  getClient(ws: WebSocket) {
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
  connect(ws: WebSocket) {
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
  disconnect(ws: WebSocket) {
    this.getClient(ws).sessionId = undefined
    this.clients.delete(ws)
  }
  markSeen(ws: WebSocket) {
    this.getClient(ws).lastSeen = Date.now()
  }
  subscribe(ws: WebSocket, ...topics: string[]) {
    const client = this.getClient(ws)
    for (const topic of topics) {
      client.subscriptions.add(topic)
    }
    this.markSeen(ws)
  }
  unsubscribe(ws: WebSocket, ...topics: string[]) {
    const client = this.getClient(ws)
    for (const topic of topics) {
      client.subscriptions.delete(topic)
    }
    this.markSeen(ws)
  }
}
